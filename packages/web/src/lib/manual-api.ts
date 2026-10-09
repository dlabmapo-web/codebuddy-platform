import { shouldForwardViewRole } from "./orpc-view-role";
import type {
  MultipleChoiceDefinition,
  ShortAnswerDefinition,
  ManualWorkspace,
  ManualSession,
  ManualAttempt,
  SaveManual,
  ManualWork,
  ManualSubmit,
  ManualReviewInput,
} from "@cove/shared";
import { publicConfig } from "./config";
import { createClient } from "./supabase/client";
const endpoint = publicConfig.apiUrl.replace(/\/rpc\/?$/, "/manual");
async function request<T>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const {
    data: { session },
  } = await createClient().auth.getSession();
  if (!session) throw new Error("Sign in to continue");
  const role = document.cookie.match(/(?:^|;\s*)cove_view_role=([^;]+)/)?.[1];
  const view: Record<string, string> =
    role && shouldForwardViewRole()
      ? { "X-Cove-View-Role": decodeURIComponent(role) }
      : {};
  const response = await fetch(endpoint + path, {
    method,
    headers: {
      ...view,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: data === undefined ? undefined : JSON.stringify(data),
    cache: "no-store",
  });
  const body = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(body.message ?? "Request failed"), {
      status: response.status,
    });
  return body as T;
}
export const manualApi = {
  capabilities: () => request<{ shortAnswer: boolean; multipleChoice: boolean }>("/capabilities"),
  choicePreview: (data: {academyId:string;definition:MultipleChoiceDefinition;selectedOptionIds:string[];displayOrder:string[]}) => request<{correct:boolean}>("/choice-preview","POST",data),
  choiceImage: (data:{academyId:string;materialId:string;assetId:string;classId?:string;submissionId?:string;preview?:boolean}) => request<{url:string}>("/choice-image?"+new URLSearchParams(Object.entries(data).filter(([,v])=>v!==undefined).map(([k,v])=>[k,String(v)]))),
  retryEvaluation: (data: {
    academyId: string;
    materialId: string;
    classId: string;
    submissionId: string;
  }) => request("/retry-evaluation", "POST", data),
  matchingPreview: (data: {
    academyId: string;
    definition: ShortAnswerDefinition;
    answer: string;
  }) => request<{ correct: boolean }>("/matching-preview", "POST", data),
  explanation: (data: {
    academyId: string;
    materialId: string;
    classId: string;
    submissionId: string;
  }) =>
    request<{ explanation: string | null }>(
      "/explanation?" + new URLSearchParams(data),
    ),
  upload: async (
    target: { academyId: string; courseId: string },
    file: File,
  ) => {
    const {
      data: { session },
    } = await createClient().auth.getSession();
    if (!session) throw new Error("Sign in to continue");
    const role = document.cookie.match(/(?:^|;\s*)cove_view_role=([^;]+)/)?.[1];
    const view: Record<string, string> =
      role && shouldForwardViewRole()
        ? { "X-Cove-View-Role": decodeURIComponent(role) }
        : {};
    const result = await fetch(
      endpoint + "/assets?" + new URLSearchParams(target),
      {
        method: "POST",
        headers: {
          ...view,
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/octet-stream",
          "X-File-Name": encodeURIComponent(file.name),
        },
        body: file,
      },
    );
    const body = await result.json();
    if (!result.ok) throw new Error(body.message ?? "Upload failed");
    return body as { assetId: string; name: string; byteSize: number };
  },
  read: (target: {
    academyId: string;
    materialId: string;
    preview?: boolean;
    classId?: string;
  }) =>
    request<ManualWorkspace>(
      "?" +
        new URLSearchParams(
          Object.entries(target)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => [k, String(v)]),
        ),
    ),
  save: (data: SaveManual) => request<{ materialId: string }>("", "POST", data),
  visibility: (data: {
    academyId: string;
    materialId: string;
    isVisible: boolean;
  }) => request("/visibility", "POST", data),
  remove: (data: { academyId: string; materialId: string }) =>
    request("", "DELETE", data),
  draft: (data: ManualWork) =>
    request<{ revision: number }>("/draft", "POST", data),
  submit: (data: ManualSubmit) =>
    request<{ submissionId: string }>("/submit", "POST", data),
  start: (
    data: ManualWork & {
      contentRevision: number;
      preview?: boolean;
      submissionId?: string;
      solution?: boolean;
    },
  ) => request<ManualSession>("/sessions", "POST", data),
  status: (id: string) => request<ManualSession>(`/sessions/${id}`),
  stop: (id: string) => request(`/sessions/${id}`, "DELETE"),
  input: (id: string, text: string) =>
    request(`/sessions/${id}/input`, "POST", { text }),
  classMaterials: (data: { academyId: string; classId: string }) =>
    request<
      Array<{
        materialId: string;
        title: string;
        type: string;
        courseTitle: string;
        includeInScore: boolean;
      }>
    >("/class-materials?" + new URLSearchParams(data)),
  roster: (data: {
    academyId: string;
    materialId: string;
    classId: string;
    userId?: string;
  }) =>
    request<
      Array<{
        userId: string;
        learnerName: string;
        draft: {
          files: Record<string, string>;
          answer: string;
          revision: number;
        } | null;
        attempts: ManualAttempt[];
      }>
    >("/roster?" + new URLSearchParams(data)),
  watch: (data: {
    academyId: string;
    materialId: string;
    classId: string;
    userId: string;
  }) => request<ManualSession>("/watch", "POST", data),
  watchStatus: (id: string) => request<ManualSession>(`/watch/${id}`),
  teacherDraft: (data: ManualWork & { classId: string; userId: string }) =>
    request("/teacher-draft", "POST", data),
  reviews: (data: { academyId: string; materialId: string; classId: string }) =>
    request<ManualAttempt[]>("/reviews?" + new URLSearchParams(data)),
  review: (data: ManualReviewInput) => request("/review", "POST", data),
};
