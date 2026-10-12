import { Upload } from "tus-js-client";
import type {
  VideoAssetSummary,
  VideoCheckpoint,
  VideoProgress,
  VideoReadResult,
  SaveVideo,
} from "@cove/shared";
import { publicConfig } from "./config";
import { createClient } from "./supabase/client";
import { shouldForwardViewRole } from "./orpc-view-role";
const endpoint = publicConfig.apiUrl.replace(/\/rpc\/?$/, "/videos");
export async function videoRequest<T>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const {
    data: { session },
  } = await createClient().auth.getSession();
  if (!session) throw new Error("Sign in to continue");
  const role = document.cookie.match(/(?:^|;\s*)cove_view_role=([^;]+)/)?.[1];
  const response = await fetch(endpoint + path, {
    method,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      ...(role && shouldForwardViewRole()
        ? { "X-Cove-View-Role": decodeURIComponent(role) }
        : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
    cache: "no-store",
  });
  const body = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(body.message ?? "Video request failed"), {
      status: response.status,
    });
  return body;
}
export type VideoTarget = {
  academyId: string;
  courseId: string;
  lectureId: string;
};
const query = (data: Record<string, string | boolean | undefined>) =>
  new URLSearchParams(
    Object.entries(data)
      .filter((x): x is [string, string | boolean] => x[1] !== undefined)
      .map(([k, v]) => [k, String(v)]),
  ).toString();
export const videoApi = {
  resources: (data: {
    academyId: string;
    materialId: string;
    preview?: boolean;
  }) =>
    videoRequest<Array<{ id: string; title: string }>>(
      "/resources?" + query(data),
    ),
  read: (data: {
    academyId: string;
    materialId: string;
    classId?: string;
    preview?: boolean;
    resource?: boolean;
  }) => videoRequest<VideoReadResult>("?" + query(data)),
  capabilities: () =>
    videoRequest<{ enabled: boolean; maxBytes: string }>("/capabilities"),
  reserve: (
    data: VideoTarget & {
      filename: string;
      byteSize: string;
      requestKey: string;
    },
  ) =>
    videoRequest<{
      assetId: string;
      token: string;
      endpoint: string;
      bucket: string;
      objectName: string;
    }>("/reserve", "POST", data),
  finish: (data: VideoTarget & { assetId: string }) =>
    videoRequest("/finish", "POST", data),
  status: (data: VideoTarget & { assetId: string }) =>
    videoRequest<VideoAssetSummary>("/asset?" + query(data)),
  cancel: (data: VideoTarget & { assetId: string }) =>
    videoRequest("/cancel", "POST", data),
  retry: (data: VideoTarget & { assetId: string }) =>
    videoRequest("/retry", "POST", data),
  caption: (
    data: VideoTarget & {
      assetId: string;
      language: string;
      label: string;
      content: string;
    },
  ) => videoRequest<SaveVideo["captions"][number]>("/caption", "POST", data),
  save: (data: SaveVideo) =>
    videoRequest<{ materialId: string }>("", "POST", data),
  mutate: (data: VideoTarget & { materialId: string; isVisible?: boolean }) =>
    videoRequest(
      data.isVisible === undefined ? "" : "/visibility",
      data.isVisible === undefined ? "DELETE" : "POST",
      data,
    ),
  session: (data: { academyId: string; materialId: string; classId: string }) =>
    videoRequest<VideoProgress>("/session", "POST", data),
  checkpoint: (data: VideoCheckpoint) =>
    videoRequest<VideoProgress>("/checkpoint", "POST", data),
  history: (data: {
    academyId: string;
    materialId: string;
    classId: string;
    userId?: string;
  }) =>
    videoRequest<
      Array<
        VideoProgress & {
          userId: string;
          learnerName: string;
          assetId: string;
          asset: { filename: string; durationMs: number };
          updatedAt: string;
        }
      >
    >("/history?" + query(data)),
  upload: (
    file: File,
    grant: {
      endpoint: string;
      token: string;
      bucket: string;
      objectName: string;
    },
    onProgress: (n: number) => void,
  ) => {
    let handle: Upload;
    const promise = new Promise<void>((resolve, reject) => {
      handle = new Upload(file, {
        endpoint: grant.endpoint,
        fingerprint: () =>
          Promise.resolve(
            `cove-video:${grant.objectName}:${file.size}:${file.lastModified}`,
          ),
        retryDelays: [0, 1000, 3000, 5000],
        onBeforeRequest: async (request) => {
          const {
            data: { session },
          } = await createClient().auth.getSession();
          if (!session) throw new Error("Sign in to resume upload");
          request.setHeader("authorization", `Bearer ${session.access_token}`);
        },
        chunkSize: 6 * 1024 * 1024,
        headers: { "x-signature": grant.token },
        metadata: {
          bucketName: grant.bucket,
          objectName: grant.objectName,
          contentType: "application/octet-stream",
          cacheControl: "300",
        },
        removeFingerprintOnSuccess: true,
        onProgress: (sent, total) =>
          onProgress(Math.round((sent / total) * 100)),
        onSuccess: () => resolve(),
        onError: reject,
      });
      void handle
        .findPreviousUploads()
        .then((previous) => {
          if (previous[0]) handle.resumeFromPreviousUpload(previous[0]);
          handle.start();
        })
        .catch(reject);
    });
    return {
      promise,
      abort: () => handle.abort(),
      resume: () => handle.start(),
    };
  },
};
export function videoMediaBase(
  academyId: string,
  materialId: string,
  assetId: string,
  mode: "main" | "preview" | "resource",
  classId?: string,
) {
  return `/api/learn/videos/${academyId}/${materialId}/${assetId}/${mode}/${classId ?? "-"}/`;
}
