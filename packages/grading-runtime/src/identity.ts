import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir, readlink } from "node:fs/promises";
import { join } from "node:path";
export async function fileDigest(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  return `sha256:${hash.digest("hex")}`;
}
/** Same canonical tree digest is emitted by guest/tree-digest.py during image build. */
export async function rootfsDigest(root: string): Promise<string> {
  const hash = createHash("sha256");
  const visit = async (relative: string): Promise<void> => {
    const path = join(root, relative);
    const st = await lstat(path);
    const kind = st.isDirectory()
      ? "d"
      : st.isFile()
        ? "f"
        : st.isSymbolicLink()
          ? "l"
          : "unsupported";
    if (kind === "unsupported")
      throw new Error(`Unsupported rootfs entry: ${relative}`);
    hash.update(`${kind}\0${relative}\0${(st.mode & 0o7777).toString(8)}\0`);
    if (st.isFile()) hash.update(await fileDigest(path));
    if (st.isSymbolicLink()) hash.update(await readlink(path));
    hash.update("\0");
    if (st.isDirectory())
      for (const name of (await readdir(path)).sort((a, b) =>
        Buffer.compare(Buffer.from(a), Buffer.from(b)),
      ))
        await visit(relative ? `${relative}/${name}` : name);
  };
  await visit("");
  return `sha256:${hash.digest("hex")}`;
}
