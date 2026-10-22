import { timingSafeEqual } from "node:crypto";
export function equalSecret(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function validateRun(body) {
  if (
    !body ||
    typeof body.files !== "object" ||
    Array.isArray(body.files) ||
    !body.files
  )
    throw new Error("Invalid files");
  const entries = Object.entries(body.files);
  if (!entries.length || entries.length > 64)
    throw new Error("File count exceeded");
  let bytes = 0;
  for (const [name, content] of entries) {
    if (
      !/^[a-zA-Z0-9_-][a-zA-Z0-9_./ -]{0,127}$/.test(name) ||
      name.split("/").some((x) => !x || x === "." || x === "..") ||
      typeof content !== "string"
    )
      throw new Error("Invalid source path");
    bytes += Buffer.byteLength(content);
  }
  if (
    bytes > 1024 * 1024 ||
    !Object.hasOwn(body.files, body.entryPoint) ||
    !body.entryPoint.endsWith(".py")
  )
    throw new Error("Invalid entry point or source size");
  for (const [key, min, max] of [
    ["width", 320, 2048],
    ["height", 320, 2048],
    ["timeLimitSeconds", 1, 1800],
    ["memoryLimitMb", 128, 512],
  ]) {
    if (!Number.isInteger(body[key]) || body[key] < min || body[key] > max)
      throw new Error(`Invalid ${key}`);
  }
  if (typeof body.owner !== "string" || body.owner.length > 200)
    throw new Error("Invalid owner");
  if (body.requestKey !== undefined && !/^[a-f0-9-]{36}$/.test(body.requestKey))
    throw new Error("Invalid request key");
  if (body.authorizationExpiresAt !== undefined && (!Number.isSafeInteger(body.authorizationExpiresAt) || body.authorizationExpiresAt <= 0))
    throw new Error('Invalid authorization expiry');
  const outputLimitBytes = body.outputLimitBytes ?? 1048576;
  if (!Number.isInteger(outputLimitBytes) || outputLimitBytes < 16384 || outputLimitBytes > 1048576)
    throw new Error("Invalid output limit");
  const assets = body.assets ?? [];
  if (
    !Array.isArray(assets) ||
    assets.length > 64 ||
    new Set(assets.map((a) => a.name)).size !== assets.length
  )
    throw new Error("Invalid assets");
  let assetBytes = 0;
  for (const asset of assets) {
    if (
      !/^[a-zA-Z0-9_-][a-zA-Z0-9_. -]{0,100}$/.test(asset.name) ||
      typeof asset.data !== "string" ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(asset.data)
    )
      throw new Error("Invalid asset");
    const bytes = Buffer.from(asset.data, "base64").length;
    if (bytes < 1 || bytes > 5242880) throw new Error("Invalid asset size");
    assetBytes += bytes;
  }
  if (assetBytes > 20971520) throw new Error("Assets exceed 20 MiB");
  if (entries.some(([name]) => name === "assets" || name.startsWith("assets/")))
    throw new Error("Reserved asset path");
  return { ...body, assets, outputLimitBytes };
}

// Parse only new stream data, retaining at most a partial control marker.
// Never repeatedly scan the accumulated terminal history.
export function terminalParser(onState) {
  const markers = [
    ["\x1eCOVE_WAITING_INPUT\x1f", "WAITING_INPUT"],
    ["\x1eCOVE_RUNNING\x1f", "RUNNING"],
    ["\x1eCOVE_DISPLAYING\x1f", "DISPLAYING"],
  ];
  let pending = "";
  return {
    push(text) {
      let value = pending + text;
      pending = "";
      const output = [];
      while (value) {
        const matches = markers
          .map(([marker, state]) => ({
            marker,
            state,
            index: value.indexOf(marker),
          }))
          .filter((match) => match.index >= 0)
          .sort((a, b) => a.index - b.index);
        const match = matches[0];
        if (match) {
          output.push(value.slice(0, match.index));
          onState(match.state);
          value = value.slice(match.index + match.marker.length);
          continue;
        }
        const prefix = value.lastIndexOf("\x1e");
        if (
          prefix >= 0 &&
          markers.some(([marker]) => marker.startsWith(value.slice(prefix)))
        ) {
          pending = value.slice(prefix);
          output.push(value.slice(0, prefix));
        } else output.push(value);
        break;
      }
      return output.join("");
    },
    end() {
      const value = pending;
      pending = "";
      return value;
    },
  };
}
