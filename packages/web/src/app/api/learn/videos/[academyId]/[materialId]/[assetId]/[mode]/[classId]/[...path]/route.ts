import { createClient } from "@/lib/supabase/server";
import { publicConfig } from "@/lib/config";
import { z } from "zod";
const schema = z.object({
  academyId: z.uuid(),
  materialId: z.uuid(),
  assetId: z.uuid(),
  mode: z.enum(["main", "preview", "resource"]),
  classId: z.union([z.uuid(), z.literal("-")]),
  path: z
    .array(
      z
        .string()
        .regex(/^[a-zA-Z0-9_.-]+$/)
        .refine((s) => s !== "." && s !== ".."),
    )
    .min(1)
    .max(5),
});
export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      academyId: string;
      materialId: string;
      assetId: string;
      mode: string;
      classId: string;
      path: string[];
    }>;
  },
) {
  const parsed = schema.safeParse(await params);
  if (!parsed.success) return new Response(null, { status: 404 });
  const client = await createClient();
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session) return new Response(null, { status: 401 });
  const { mode, path, classId, ...scope } = parsed.data;
  const query = new URLSearchParams({
    ...scope,
    path: path.join("/"),
    preview: String(mode === "preview"),
    resource: String(mode === "resource"),
    ...(classId !== "-" ? { classId } : {}),
  });
  try {
    const upstream = await fetch(
      publicConfig.apiUrl.replace(/\/rpc\/?$/, "/videos/media") + "?" + query,
      {
        headers: {
          "Accept-Encoding": "identity",
          Authorization: `Bearer ${session.access_token}`,
          ...(request.headers.has("range")
            ? { Range: request.headers.get("range")! }
            : {}),
        },
        signal: request.signal,
        cache: "no-store",
        redirect: "error",
      },
    );
    const headers = new Headers({
      "Cache-Control": "private, no-store",
      "Cross-Origin-Resource-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
    });
    for (const h of [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
    ])
      if (upstream.headers.has(h)) headers.set(h, upstream.headers.get(h)!);
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return new Response(null, { status: 502 });
  }
}
