export function runtimeImages(current, retained = "", production = false) {
  const images = [...new Set([current, ...retained.split(",").map((x) => x.trim()).filter(Boolean)])];
  if (images.length > 17) throw new Error("Too many retained GUI runtimes; review retention before upgrading");
  if (production && images.some((ref) => !/^ghcr\.io\/[a-z0-9_.-]+\/[a-z0-9_.-]+@sha256:[0-9a-f]{64}$/.test(ref)))
    throw new Error("Production GUI images must be approved registry digests");
  return images;
}

export function selectRuntimeImage(versions, currentVersion, requestedVersion) {
  const image = versions.get(requestedVersion || currentVersion);
  if (!image) throw Object.assign(new Error("The saved runtime version is not available"), { status: 503 });
  return image;
}
