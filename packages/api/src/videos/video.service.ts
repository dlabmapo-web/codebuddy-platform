import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import {
  videoConfigSchema,
  videoExtensions,
  videoMaxBytes,
  videoCaptionSchema,
  creditVideoCheckpoint,
  watchedMilliseconds,
  type SaveVideo,
  type VideoReadResult,
  type VideoCheckpoint,
  type WatchedInterval,
  type VideoReportQuery,
  type VideoClassReport,
} from "@cove/shared";
import { PrismaService } from "../database/prisma.service.js";
import { Prisma } from "../generated/prisma/client.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { AuditService } from "../academies/audit.service.js";
import {
  enrolledClassWhere,
  taughtClassWhere,
  learningScopeFor,
} from "../classes/assigned-course-access.js";
import { visibleCurriculumInclude } from "../learn/curriculum-outline.service.js";
import {
  bumpContentRevision,
  nextMaterialPosition,
  compactMaterialPositions,
} from "../content/content-positions.js";
import {
  sanitizeChoiceHtml,
  choiceAssetIds,
} from "../manual/multiple-choice.service.js";
import { VideoStorage } from "./video-storage.js";
import { readVideoClassReport } from "./video-report.js";
import { normalizeVideoCaption } from "./video-captions.js";
type Target = { academyId: string; courseId: string; lectureId: string };
type Read = {
  academyId: string;
  materialId: string;
  classId?: string;
  preview?: boolean;
  resource?: boolean;
};
const include = {
  videoLesson: { include: { asset: true } },
  lecture: { include: { courseModule: { include: { course: true } } } },
} as const;
import { videoAssetSummary } from "./video-metadata.js";
const progressDTO = (p: {
  positionMs: number;
  watchedMs: number;
  completed: boolean;
  sequence: number;
  sessionId: string;
}) => ({
  positionMs: p.positionMs,
  watchedMs: p.watchedMs,
  completed: p.completed,
  sequence: p.sequence,
  sessionId: p.sessionId,
});
@Injectable()
export class VideoService {
  constructor(
    private readonly db: PrismaService,
    private readonly access: AcademyAccessService,
    private readonly storage: VideoStorage,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}
  enabled() {
    const flag = this.config.get("VIDEO_LESSONS_ENABLED");
    return flag === true || flag === "true";
  }
  assertEnabled() {
    if (!this.enabled())
      throw new ServiceUnavailableException(
        "Video changes and tracking are currently unavailable",
      );
  }
  async author(identity: SupabaseIdentity, target: Target) {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      target.academyId,
      "curriculum.manage",
    );
    if (
      !(await this.db.lecture.findFirst({
        where: {
          id: target.lectureId,
          courseModule: {
            courseId: target.courseId,
            course: { academyId: target.academyId },
          },
        },
      }))
    )
      throw new NotFoundException();
    return actor;
  }
  async reserve(
    identity: SupabaseIdentity,
    input: Target & { filename: string; byteSize: string; requestKey: string },
  ) {
    this.assertEnabled();
    const actor = await this.author(identity, input);
    const extension = input.filename.split(".").at(-1)?.toLowerCase();
    if (
      !videoExtensions.includes(
        extension as (typeof videoExtensions)[number],
      ) ||
      /[\x00-\x1f\/\\]/.test(input.filename)
    )
      throw new BadRequestException("Unsupported video filename");
    const limit = Math.min(
      videoMaxBytes,
      Number(this.config.get("VIDEO_MAX_UPLOAD_BYTES") ?? videoMaxBytes),
    );
    if (BigInt(input.byteSize) > BigInt(limit))
      throw new BadRequestException(
        `Video exceeds configured ${limit} byte limit`,
      );
    const asset = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM courses WHERE id=${input.courseId}::uuid FOR UPDATE`;
      const existing = await tx.videoAsset.findUnique({
        where: { requestKey: input.requestKey },
      });
      if (existing) {
        if (
          existing.uploaderUserId !== actor.userId ||
          existing.courseId !== input.courseId ||
          existing.lectureId !== input.lectureId ||
          existing.byteSize !== BigInt(input.byteSize) ||
          existing.filename !== input.filename
        )
          throw new ConflictException("Upload request key already used");
        return existing;
      }
      if (
        (await tx.videoAsset.count({
          where: {
            uploaderUserId: actor.userId,
            state: { in: ["UPLOADING", "VERIFYING", "PROCESSING"] },
          },
        })) >= 3
      )
        throw new ConflictException(
          "Finish or cancel an existing upload first",
        );
      const total = await tx.videoAsset.aggregate({
        where: {
          courseId: input.courseId,
          state: { notIn: ["DELETED", "CANCELLED"] },
        },
        _sum: { byteSize: true },
      });
      if (
        (total._sum.byteSize ?? 0n) + BigInt(input.byteSize) >
        BigInt(this.config.get("VIDEO_COURSE_QUOTA_BYTES") ?? 100_000_000_000)
      )
        throw new BadRequestException("Course video storage quota exceeded");
      const id = randomUUID();
      return tx.videoAsset.create({
        data: {
          ...input,
          id,
          byteSize: BigInt(input.byteSize),
          uploaderUserId: actor.userId,
          objectKey: `${input.academyId}/${id}/original.${extension}`,
        },
      });
    });
    if (
      asset.state !== "UPLOADING" ||
      Date.now() - asset.createdAt.getTime() > 86400000
    )
      throw new ConflictException(
        "Upload reservation expired or already finished",
      );
    return {
      assetId: asset.id,
      maxBytes: String(limit),
      ...(await this.storage.grant(asset.objectKey)),
    };
  }
  async ownedAsset(
    identity: SupabaseIdentity,
    target: Target,
    assetId: string,
  ) {
    const actor = await this.author(identity, target);
    const a = await this.db.videoAsset.findFirst({
      where: {
        id: assetId,
        uploaderUserId: actor.userId,
        academyId: target.academyId,
        courseId: target.courseId,
        lectureId: target.lectureId,
      },
    });
    if (!a) throw new NotFoundException();
    return a;
  }
  async finish(
    identity: SupabaseIdentity,
    input: Target & { assetId: string },
  ) {
    this.assertEnabled();
    const a = await this.ownedAsset(identity, input, input.assetId);
    if (a.state !== "UPLOADING") return videoAssetSummary(a);
    const info = await this.storage.info(a.objectKey);
    if (!info.size || BigInt(info.size) !== a.byteSize)
      throw new BadRequestException("Uploaded bytes do not match reservation");
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM video_assets WHERE id=${a.id}::uuid FOR UPDATE`;
      const fresh = await tx.videoAsset.findUniqueOrThrow({
        where: { id: a.id },
      });
      if (fresh.state !== "UPLOADING") return;
      await tx.videoAsset.update({
        where: { id: a.id },
        data: { state: "VERIFYING" },
      });
      await tx.videoProcessingJob.create({ data: { assetId: a.id } });
    });
    return { state: "VERIFYING", assetId: a.id };
  }
  async status(
    identity: SupabaseIdentity,
    input: Target & { assetId: string },
  ) {
    return videoAssetSummary(
      await this.ownedAsset(identity, input, input.assetId),
    );
  }
  async cancel(
    identity: SupabaseIdentity,
    input: Target & { assetId: string },
  ) {
    this.assertEnabled();
    const a = await this.ownedAsset(identity, input, input.assetId);
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM video_assets WHERE id=${a.id}::uuid FOR UPDATE`;
      if (
        (await tx.videoLesson.count({ where: { assetId: a.id } })) ||
        a.consumedAt
      )
        throw new ConflictException(
          "Published or saved assets cannot be discarded",
        );
      await tx.videoAsset.update({
        where: { id: a.id },
        data: { state: "CANCELLED" },
      });
      await tx.videoProcessingJob.updateMany({
        where: { assetId: a.id },
        data: { status: "CANCELLED", leaseId: null },
      });
    });
    return { ok: true };
  }
  async retry(identity: SupabaseIdentity, input: Target & { assetId: string }) {
    this.assertEnabled();
    const a = await this.ownedAsset(identity, input, input.assetId);
    if (a.state !== "FAILED" || !a.failureCode?.startsWith("TRANSIENT"))
      throw new ConflictException("This video needs a supported replacement");
    await this.db.$transaction(async (tx) => {
      await tx.videoAsset.update({
        where: { id: a.id },
        data: { state: "VERIFYING", failureCode: null },
      });
      await tx.videoProcessingJob.update({
        where: { assetId: a.id },
        data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date() },
      });
    });
    return { ok: true };
  }
  async caption(
    identity: SupabaseIdentity,
    input: Target & {
      assetId: string;
      language: string;
      label: string;
      content: string;
    },
  ) {
    this.assertEnabled();
    const actor = await this.author(identity, input);
    const a = await this.db.videoAsset.findFirst({
      where: {
        id: input.assetId,
        OR: [
          {
            uploaderUserId: actor.userId,
            academyId: input.academyId,
            courseId: input.courseId,
            lectureId: input.lectureId,
          },
          {
            lessons: {
              some: {
                material: {
                  lectureId: input.lectureId,
                  lecture: {
                    courseModule: {
                      courseId: input.courseId,
                      course: { academyId: input.academyId },
                    },
                  },
                },
              },
            },
          },
        ],
      },
    });
    if (!a) throw new NotFoundException();
    if (a.state !== "READY")
      throw new ConflictException("Prepare the video before adding subtitles");
    const id = randomUUID(),
      path = `captions/${id}.vtt`;
    const track = videoCaptionSchema.parse({
      id,
      language: input.language,
      label: input.label,
      path,
    });
    const text = normalizeVideoCaption(input.content, a.durationMs);
    const objectKey = `${a.academyId}/${a.id}/${path}`;
    await this.storage.put(objectKey, text, "text/vtt");
    await this.db.videoCaption.create({
      data: {
        id,
        assetId: a.id,
        objectKey,
        uploaderUserId: actor.userId,
        language: track.language,
        label: track.label,
      },
    });
    return track;
  }
  async save(identity: SupabaseIdentity, input: SaveVideo) {
    this.assertEnabled();
    const actor = await this.author(identity, input);
    return this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM courses WHERE id=${input.courseId}::uuid FOR UPDATE`;
        const existing = input.materialId
          ? await tx.material.findFirst({
              where: {
                id: input.materialId,
                lectureId: input.lectureId,
                type: "VIDEO_LESSON",
              },
              include: { videoLesson: true },
            })
          : null;
        if (
          input.materialId &&
          (!existing?.videoLesson ||
            existing.videoLesson.revision !== input.revision)
        )
          throw new ConflictException("Video changed; reload before saving");
        const replay = !input.materialId
          ? await tx.videoLesson.findUnique({
              where: { requestKey: input.requestKey },
              include: { material: true },
            })
          : null;
        if (replay) {
          if (
            replay.material.lectureId !== input.lectureId ||
            replay.assetId !== input.assetId ||
            replay.material.title !== input.title
          )
            throw new ConflictException();
          return { materialId: replay.materialId };
        }
        const old = existing?.videoLesson;
        await tx.$queryRaw`SELECT id FROM video_assets WHERE id=${input.assetId}::uuid FOR UPDATE`;
        const asset = await tx.videoAsset.findUnique({
          where: { id: input.assetId },
        });
        if (
          !asset ||
          !["READY", "VERIFYING", "PROCESSING"].includes(asset.state)
        )
          throw new BadRequestException("Select a valid uploaded video");
        if (
          old?.assetId !== input.assetId &&
          (asset.uploaderUserId !== actor.userId ||
            asset.academyId !== input.academyId ||
            asset.courseId !== input.courseId ||
            asset.lectureId !== input.lectureId ||
            asset.consumedAt)
        )
          throw new ForbiddenException();
        if (existing?.isVisible && asset.state !== "READY")
          throw new ConflictException(
            "Replacement must finish processing before it can replace the published video",
          );
        if (
          old &&
          (old.maximumHundredths !== input.maximumHundredths ||
            old.thresholdBasisPoints !== input.thresholdBasisPoints) &&
          (await tx.videoWatchProgress.count({
            where: { materialId: old.materialId },
          }))
        )
          throw new ConflictException(
            "Watching has begun; score and completion policy are locked",
          );
        for (const caption of input.captions) {
          const stored = await tx.videoCaption.findUnique({
            where: { id: caption.id },
          });
          if (
            !stored ||
            stored.assetId !== input.assetId ||
            stored.language !== caption.language ||
            stored.label !== caption.label ||
            stored.objectKey !==
              `${asset.academyId}/${asset.id}/${caption.path}`
          )
            throw new BadRequestException("Subtitle is not authorized");
        }
        const description = sanitizeChoiceHtml(input.description);
        const previousAssets = old ? videoConfigSchema.parse(old).assets : [];
        for (const image of input.assets) {
          const stored = await tx.manualAsset.findUnique({
            where: { id: image.assetId },
          });
          if (
            !stored?.mimeType.startsWith("image/") ||
            stored.name !== image.name ||
            stored.byteSize !== image.byteSize ||
            (!(
              stored.academyId === input.academyId &&
              stored.courseId === input.courseId
            ) &&
              !previousAssets.some((a) => a.assetId === image.assetId))
          )
            throw new BadRequestException("Image is not authorized");
        }
        if (
          choiceAssetIds(description).some(
            (id) => !input.assets.some((a) => a.assetId === id),
          )
        )
          throw new BadRequestException(
            "Description image is missing from its manifest",
          );
        const data = {
          assetId: input.assetId,
          description,
          assets: input.assets as Prisma.InputJsonValue,
          placement: input.placement,
          includeInScore: input.includeInScore,
          maximumHundredths: input.maximumHundredths,
          thresholdBasisPoints: input.thresholdBasisPoints,
          captions: input.captions as Prisma.InputJsonValue,
          revision: old ? old.revision + 1 : 1,
        };
        const materialId = input.materialId ?? randomUUID();
        if (existing) {
          await tx.material.update({
            where: { id: materialId },
            data: { title: input.title },
          });
          await tx.videoLesson.update({ where: { materialId }, data });
        } else
          await tx.material.create({
            data: {
              id: materialId,
              title: input.title,
              type: "VIDEO_LESSON",
              lectureId: input.lectureId,
              position: await nextMaterialPosition(tx, input.lectureId),
              isRequired: false,
              isVisible: false,
              videoLesson: {
                create: { ...data, requestKey: input.requestKey },
              },
            },
          });
        if (old?.assetId !== asset.id)
          await tx.videoAsset.update({
            where: { id: asset.id },
            data: { consumedAt: new Date() },
          });
        await bumpContentRevision(tx, input.courseId);
        await this.audit.write(tx, {
          actorUserId: actor.userId,
          academyId: input.academyId,
          action: "content.video.saved",
          targetType: "Material",
          targetId: materialId,
          after: { assetId: asset.id, revision: data.revision },
        });
        return { materialId };
      },
      { timeout: 30000 },
    );
  }
  async mutate(
    identity: SupabaseIdentity,
    input: Target & { materialId: string },
    visible?: boolean,
  ) {
    const actor = await this.author(identity, input);
    this.assertEnabled();
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM courses WHERE id=${input.courseId}::uuid FOR UPDATE`;
      const row = await tx.material.findFirst({
        where: {
          id: input.materialId,
          lectureId: input.lectureId,
          type: "VIDEO_LESSON",
        },
        include,
      });
      if (!row?.videoLesson) throw new NotFoundException();
      if (visible === true && row.videoLesson.asset.state !== "READY")
        throw new ConflictException("Video is not ready");
      if (visible === undefined) {
        await tx.material.delete({ where: { id: row.id } });
        await compactMaterialPositions(tx, input.lectureId);
      } else
        await tx.material.update({
          where: { id: row.id },
          data: { isVisible: visible },
        });
      await bumpContentRevision(tx, input.courseId);
      await this.audit.write(tx, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "content.video.visibility",
        targetType: "Material",
        targetId: row.id,
        after: { visible: visible ?? false },
      });
    });
    return { ok: true };
  }
  async accessible(identity: SupabaseIdentity, input: Read) {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      input.preview ? "curriculum.review" : "curriculum.read",
    );
    const scope = learningScopeFor(input.academyId, actor);
    const row = await this.db.material.findFirst({
      where: {
        id: input.materialId,
        type: "VIDEO_LESSON",
        AND: [
          input.preview
            ? {
                lecture: {
                  courseModule: { course: { academyId: input.academyId } },
                },
              }
            : scope.material,
          ...(input.preview
            ? []
            : [
                {
                  isVisible: true,
                  lecture: {
                    isVisible: true,
                    courseModule: {
                      isVisible: true,
                      course: { academyId: input.academyId, isVisible: true },
                    },
                  },
                },
              ]),
        ],
      },
      include,
    });
    if (
      !row?.videoLesson ||
      (!input.preview && row.videoLesson.asset.state !== "READY")
    )
      throw new NotFoundException();
    if (
      input.classId &&
      !(await this.db.class.findFirst({
        where: {
          id: input.classId,
          ...(actor.role === "STUDENT"
            ? enrolledClassWhere(input.academyId, actor.userId)
            : actor.role === "TEACHER"
              ? taughtClassWhere(input.academyId, actor.userId)
              : { academyId: input.academyId, status: "ACTIVE" }),
          courseAssignments: {
            some: { courseId: row.lecture.courseModule.course.id },
          },
        },
      }))
    )
      throw new NotFoundException();
    return { actor, row, lesson: row.videoLesson };
  }
  async resources(identity: SupabaseIdentity, input: Read) {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      input.preview ? "curriculum.review" : "curriculum.read",
    );
    const context = await this.db.material.findFirst({
      where: {
        id: input.materialId,
        AND: [
          input.preview
            ? {
                lecture: {
                  courseModule: { course: { academyId: input.academyId } },
                },
              }
            : learningScopeFor(input.academyId, actor).material,
          ...(input.preview
            ? []
            : [
                {
                  isVisible: true,
                  lecture: {
                    isVisible: true,
                    courseModule: {
                      isVisible: true,
                      course: { academyId: input.academyId, isVisible: true },
                    },
                  },
                },
              ]),
        ],
      },
      select: { lectureId: true },
    });
    if (!context) throw new NotFoundException();
    return this.db.material.findMany({
      where: {
        lectureId: context.lectureId,
        isVisible: true,
        videoLesson: {
          placement: { in: ["BOTH", "SUPPLEMENTARY"] },
          asset: { state: "READY" },
        },
      },
      select: { id: true, title: true },
      orderBy: { position: "asc" },
    });
  }
  async read(
    identity: SupabaseIdentity,
    input: Read,
  ): Promise<VideoReadResult> {
    const { actor, row, lesson } = await this.accessible(identity, input);
    if (
      lesson.placement === "SUPPLEMENTARY" &&
      !input.resource &&
      !input.preview
    )
      throw new NotFoundException();
    const classes =
      actor.role === "STUDENT"
        ? await this.db.class.findMany({
            where: {
              ...enrolledClassWhere(input.academyId, actor.userId),
              courseAssignments: {
                some: { courseId: row.lecture.courseModule.course.id },
              },
            },
            select: { id: true, name: true },
          })
        : [];
    const classId =
      input.classId ?? (classes.length === 1 ? classes[0].id : undefined);
    const progress =
      classId && !input.preview
        ? await this.db.videoWatchProgress.findUnique({
            where: {
              materialId_assetId_userId_classId: {
                materialId: row.id,
                assetId: lesson.assetId,
                userId: actor.userId,
                classId,
              },
            },
          })
        : null;
    const course = await this.db.course.findUnique({
      where: { id: row.lecture.courseModule.course.id },
      include: visibleCurriculumInclude,
    });
    const materials: VideoReadResult["materials"] = [],
      resources: VideoReadResult["resources"] = [];
    for (const module of course?.modules ?? [])
      for (const lecture of module.lectures)
        for (const material of lecture.materials) {
          const video = material.videoLesson;
          const pdf = material.pdfDocument;
          if (
            material.programmingExercise ||
            material.manualMaterial ||
            (pdf?.asset.state === "READY" &&
              pdf.placement !== "SUPPLEMENTARY") ||
            (video?.asset.state === "READY" &&
              video.placement !== "SUPPLEMENTARY")
          )
            materials.push({
              materialId: material.id,
              title: material.title,
              type: material.type,
              lectureId: lecture.id,
            });
          if (
            lecture.id === row.lectureId &&
            ((pdf?.asset.state === "READY" && pdf.placement !== "MAIN") ||
              (video?.asset.state === "READY" && video.placement !== "MAIN"))
          )
            resources.push({
              materialId: material.id,
              title: material.title,
              type: material.type,
            });
        }
    return {
      materialId: row.id,
      title: row.title,
      config: videoConfigSchema.parse(lesson),
      asset: videoAssetSummary(lesson.asset),
      classes: classes.map((c) => ({ classId: c.id, name: c.name })),
      progress: progress ? progressDTO(progress) : null,
      trackingAvailable: this.enabled(),
      canTrack: actor.role === "STUDENT",
      canReview: actor.role !== "STUDENT",
      course: {
        id: row.lecture.courseModule.course.id,
        title: row.lecture.courseModule.course.title,
      },
      lecture: { id: row.lectureId, title: row.lecture.title },
      materials,
      resources,
    };
  }
  async mediaKey(
    identity: SupabaseIdentity,
    input: Read & { assetId: string; path: string },
  ) {
    const { lesson } = await this.accessible(identity, input);
    if (lesson.assetId !== input.assetId || lesson.asset.state !== "READY")
      throw new NotFoundException();
    if (
      !/^[a-z0-9_./-]+$/.test(input.path) ||
      input.path.split("/").some((p) => p === ".." || p === "." || !p)
    )
      throw new NotFoundException();
    if (input.path.startsWith("images/")) {
      const id = input.path.slice(7);
      const config = videoConfigSchema.parse(lesson);
      if (
        !config.assets.some((a) => a.assetId === id) ||
        !choiceAssetIds(config.description).includes(id)
      )
        throw new NotFoundException();
      const asset = await this.db.manualAsset.findUnique({ where: { id } });
      if (!asset?.mimeType.startsWith("image/")) throw new NotFoundException();
      return { key: asset.objectKey, bucket: "turtle-assets" };
    }
    const files = lesson.asset.outputs as string[];
    const captions = videoConfigSchema.parse(lesson).captions;
    if (
      !files.includes(input.path) &&
      !captions.some((c) => c.path === input.path)
    )
      throw new NotFoundException();
    return {
      key: `${lesson.asset.academyId}/${lesson.asset.id}/${input.path}`,
      bucket: "course-videos",
    };
  }
  async session(identity: SupabaseIdentity, input: Read & { classId: string }) {
    this.assertEnabled();
    const { actor, row, lesson } = await this.accessible(identity, {
      ...input,
      resource: true,
    });
    if (actor.role !== "STUDENT" || input.preview)
      throw new ForbiddenException();
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM materials WHERE id=${row.id}::uuid FOR UPDATE`;
      const where = {
        materialId_assetId_userId_classId: {
          materialId: row.id,
          assetId: lesson.assetId,
          userId: actor.userId,
          classId: input.classId,
        },
      };
      const old = await tx.videoWatchProgress.findUnique({ where });
      const p = await tx.videoWatchProgress.upsert({
        where,
        create: {
          ...where.materialId_assetId_userId_classId,
          sessionId: randomUUID(),
          thresholdBasisPoints: lesson.thresholdBasisPoints,
          maximumHundredths: lesson.maximumHundredths,
        },
        update: {
          sessionId: randomUUID(),
          sequence: 0,
          sampleElapsedMs: 0,
          sessionStartedAt: new Date(),
          previousPlaying: false,
          positionMs: old?.completed ? 0 : (old?.positionMs ?? 0),
        },
      });
      return progressDTO(p);
    });
  }
  async checkpoint(identity: SupabaseIdentity, input: VideoCheckpoint) {
    this.assertEnabled();
    const { actor, row, lesson } = await this.accessible(identity, {
      ...input,
      resource: true,
    });
    if (actor.role !== "STUDENT" || lesson.assetId !== input.assetId)
      throw new ConflictException("Video changed; reload before tracking");
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM materials WHERE id=${row.id}::uuid FOR UPDATE`;
      const fresh = await tx.videoLesson.findUniqueOrThrow({
        where: { materialId: row.id },
      });
      if (fresh.assetId !== input.assetId) throw new ConflictException();
      const where = {
        materialId_assetId_userId_classId: {
          materialId: row.id,
          assetId: input.assetId,
          userId: actor.userId,
          classId: input.classId,
        },
      };
      const p = await tx.videoWatchProgress.findUnique({ where });
      if (!p || p.sessionId !== input.sessionId)
        throw new ConflictException("Playback session replaced by another tab");
      if (input.sequence <= p.sequence) return progressDTO(p);
      if (input.sequence !== p.sequence + 1)
        throw new ConflictException("Checkpoint sequence is out of order");
      if (
        input.elapsedMs < p.sampleElapsedMs ||
        input.elapsedMs > Date.now() - p.sessionStartedAt.getTime() + 2000
      )
        throw new BadRequestException("Invalid playback clock");
      const next = creditVideoCheckpoint({
        intervals: p.intervals as WatchedInterval[],
        previousMs: p.positionMs,
        positionMs: input.positionMs,
        elapsedMs: input.elapsedMs - p.sampleElapsedMs,
        rate: input.rate,
        playing: p.previousPlaying,
        seeking: input.seeking,
        durationMs: lesson.asset.durationMs,
        creditEnabled: true,
      });
      if (next.intervals.length > 4096)
        throw new BadRequestException("Too many discontinuous watch intervals");
      const watchedMs = watchedMilliseconds(next.intervals);
      const completed =
        p.completed ||
        watchedMs * 10000 >= lesson.asset.durationMs * p.thresholdBasisPoints;
      const updated = await tx.videoWatchProgress.update({
        where,
        data: {
          intervals: next.intervals as Prisma.InputJsonValue,
          positionMs: next.positionMs,
          watchedMs,
          completed,
          sequence: input.sequence,
          sampleElapsedMs: input.elapsedMs,
          previousPlaying: input.playing && !input.seeking,
        },
      });
      return progressDTO(updated);
    });
  }
  async report(identity: SupabaseIdentity, input: VideoReportQuery): Promise<VideoClassReport> {
    const { actor, row, lesson } = await this.accessible(identity, { ...input, preview: false, resource: true });
    if (!["TEACHER", "MANAGER", "TEAM_LEAD"].includes(actor.role)) throw new ForbiddenException();
    const classroom = await this.db.class.findFirst({
      where: {
        id: input.classId,
        ...(actor.role === "TEACHER" ? taughtClassWhere(input.academyId, actor.userId) : { academyId: input.academyId, status: "ACTIVE" }),
        courseAssignments: { some: { courseId: row.lecture.courseModule.course.id } },
      },
      select: { id: true, name: true },
    });
    if (!classroom) throw new ForbiddenException();
    const report = await readVideoClassReport(this.db, input, lesson.assetId);
    return {
      ...report,
      material: { id: row.id, title: row.title, assetId: lesson.assetId, filename: lesson.asset.filename, durationMs: lesson.asset.durationMs },
      course: { id: row.lecture.courseModule.course.id, title: row.lecture.courseModule.course.title },
      class: classroom,
      trackingAvailable: this.enabled(),
      updatedAt: new Date().toISOString(),
    };
  }
  async history(
    identity: SupabaseIdentity,
    input: Read & { classId: string; userId?: string },
  ) {
    const { actor, row } = await this.accessible(identity, {
      ...input,
      preview: false,
      resource: true,
    });
    if (actor.role !== "STUDENT") {
      if (
        !(await this.db.class.findFirst({
          where: {
            id: input.classId,
            ...(actor.role === "TEACHER"
              ? taughtClassWhere(input.academyId, actor.userId)
              : { academyId: input.academyId }),
            courseAssignments: {
              some: { courseId: row.lecture.courseModule.course.id },
            },
          },
        }))
      )
        throw new ForbiddenException();
    }
    const records = await this.db.videoWatchProgress.findMany({
      where: {
        materialId: row.id,
        classId: input.classId,
        userId: actor.role === "STUDENT" ? actor.userId : input.userId,
      },
      include: { asset: { select: { filename: true, durationMs: true } } },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });
    const users = await this.db.user.findMany({
      where: { id: { in: [...new Set(records.map((p) => p.userId))] } },
      select: { id: true, displayName: true },
    });
    const names = new Map(users.map((u) => [u.id, u.displayName]));
    return records.map((p) => ({
      ...progressDTO(p),
      learnerName: names.get(p.userId) ?? "",
      assetId: p.assetId,
      userId: p.userId,
      asset: p.asset,
      maximumHundredths: p.maximumHundredths,
      updatedAt: p.updatedAt.toISOString(),
    }));
  }
}
