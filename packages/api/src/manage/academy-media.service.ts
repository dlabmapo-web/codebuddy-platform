import { HttpStatus, Injectable } from "@nestjs/common";
import type { AcademyMedia } from "@cove/shared";

import { AuditService } from "../academies/audit.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import {
  profileImageBucket,
  ProfileMediaService,
} from "../profile/profile-media.service.js";
import { ManagerScopeService } from "./manager-scope.service.js";

const MAX_GALLERY_IMAGES = 6;

@Injectable()
export class AcademyMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopes: ManagerScopeService,
    private readonly audit: AuditService,
    private readonly media: ProfileMediaService,
  ) {}

  async upload(
    identity: SupabaseIdentity,
    input: {
      academyId: string;
      kind: "COVER" | "GALLERY";
      altText: string | null;
      isDecorative: boolean;
      file: Buffer;
    },
  ): Promise<{ cover: AcademyMedia | null; gallery: AcademyMedia[] }> {
    const actor = await this.scopes.requireManager(
      identity,
      input.academyId,
      "academy.settings.manage",
    );
    const altText = input.altText?.trim() || null;
    if (!input.isDecorative && !altText) {
      throw new AppException("ACADEMY_MEDIA_ALT_REQUIRED", HttpStatus.UNPROCESSABLE_ENTITY);
    }

    if (input.kind === "GALLERY") {
      const count = await this.prisma.academyMedia.count({
        where: { academyId: input.academyId, kind: "GALLERY" },
      });
      if (count >= MAX_GALLERY_IMAGES) {
        throw new AppException("ACADEMY_MEDIA_LIMIT_REACHED", HttpStatus.CONFLICT);
      }
    }

    const image = await this.media.normalizeAcademy(input.file, input.kind);
    const assetId = this.media.newAssetId();
    const objectKey = this.media.academyMediaObjectKey(
      input.academyId,
      input.kind,
      assetId,
    );
    await this.prisma.mediaAsset.create({
      data: {
        id: assetId,
        bucket: profileImageBucket,
        objectKey,
        purpose: input.kind === "COVER" ? "ACADEMY_COVER" : "ACADEMY_GALLERY",
        uploaderUserId: actor.userId,
        contentType: image.contentType,
        sizeBytes: image.bytes.byteLength,
        width: image.width,
        height: image.height,
        checksumSha256: image.checksumSha256,
      },
    });
    await this.media.upload(objectKey, image);

    try {
      await this.prisma.$transaction(async (transaction) => {
        const existing = input.kind === "COVER"
          ? await transaction.academyMedia.findFirst({
              where: { academyId: input.academyId, kind: "COVER" },
            })
          : null;
        const lastGallery = input.kind === "GALLERY"
          ? await transaction.academyMedia.findFirst({
              where: { academyId: input.academyId, kind: "GALLERY" },
              orderBy: { position: "desc" },
            })
          : null;

        if (existing) {
          await transaction.academyMedia.delete({ where: { id: existing.id } });
          await transaction.mediaAsset.update({
            where: { id: existing.assetId },
            data: { supersededAt: new Date() },
          });
        }
        const created = await transaction.academyMedia.create({
          data: {
            academyId: input.academyId,
            assetId,
            kind: input.kind,
            position: input.kind === "COVER" ? 0 : (lastGallery?.position ?? -1) + 1,
            altText,
            isDecorative: input.isDecorative,
          },
        });
        await this.audit.write(transaction, {
          actorUserId: actor.userId,
          academyId: input.academyId,
          action: `academy.profile.${input.kind.toLowerCase()}_uploaded`,
          targetType: "AcademyMedia",
          targetId: created.id,
          after: { kind: input.kind, isDecorative: input.isDecorative },
        });
      });
    } catch (error) {
      await this.media.discard(objectKey);
      throw error;
    }
    return this.presentForAcademy(input.academyId);
  }

  async remove(
    identity: SupabaseIdentity,
    input: { academyId: string; mediaId: string },
  ): Promise<{ cover: AcademyMedia | null; gallery: AcademyMedia[] }> {
    const actor = await this.scopes.requireManager(
      identity,
      input.academyId,
      "academy.settings.manage",
    );
    await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.academyMedia.findFirst({
        where: { id: input.mediaId, academyId: input.academyId },
      });
      if (!existing) {
        throw new AppException("ACADEMY_MEDIA_NOT_FOUND", HttpStatus.NOT_FOUND);
      }
      await transaction.academyMedia.delete({ where: { id: existing.id } });
      await transaction.mediaAsset.update({
        where: { id: existing.assetId },
        data: { supersededAt: new Date() },
      });
      await this.audit.write(transaction, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "academy.profile.media_removed",
        targetType: "AcademyMedia",
        targetId: existing.id,
        before: { kind: existing.kind },
      });
    });
    return this.presentForAcademy(input.academyId);
  }

  async presentForAcademy(
    academyId: string,
  ): Promise<{ cover: AcademyMedia | null; gallery: AcademyMedia[] }> {
    const rows = await this.prisma.academyMedia.findMany({
      where: { academyId },
      include: { asset: true },
      orderBy: [{ kind: "asc" }, { position: "asc" }, { id: "asc" }],
    });
    const signed = await this.media.signMany(
      rows.map((row) => ({
        id: row.asset.id,
        bucket: row.asset.bucket,
        objectKey: row.asset.objectKey,
      })),
    );
    const signedById = new Map(signed.map((item) => [item.assetId, item]));
    const items = rows.flatMap((row): AcademyMedia[] => {
      const image = signedById.get(row.assetId);
      return image
        ? [{
            id: row.id,
            assetId: row.assetId,
            kind: row.kind,
            position: row.position,
            altText: row.altText,
            isDecorative: row.isDecorative,
            url: image.url,
            expiresAt: image.expiresAt,
          }]
        : [];
    });
    return {
      cover: items.find((item) => item.kind === "COVER") ?? null,
      gallery: items.filter((item) => item.kind === "GALLERY"),
    };
  }
}
