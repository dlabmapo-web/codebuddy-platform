import { createServer, type Server } from "node:net";
import { chmod, lstat } from "node:fs/promises";
import {
  decodeBrokerRequest,
  type BrokerRequest,
  type BrokerResponse,
} from "@cove/shared";
import { frame, FrameDecoder } from "./protocol.js";
import { invariant } from "./errors.js";
export async function serve(
  path: string,
  handle: (r: BrokerRequest) => Promise<BrokerResponse>,
): Promise<Server> {
  try {
    await lstat(path);
    throw new Error("Socket already exists; verify previous broker stopped");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  let connections = 0;
  const server = createServer((socket) => {
    if (connections >= 4) {
      socket.destroy();
      return;
    }
    connections++;
    let used = false;
    socket.setTimeout(120000, () => socket.destroy());
    socket.on("error", () => {});
    socket.on("close", () => connections--);
    const decoder = new FrameDecoder((raw) => {
      invariant(!used, "One request per connection");
      used = true;
      socket.pause();
      const request = decodeBrokerRequest(raw);
      void handle(request).then(
        (response) => {
          if (!socket.destroyed) socket.end(frame(response));
        },
        () => socket.destroy(),
      );
    });
    socket.on("data", (chunk) => {
      try {
        decoder.push(chunk);
      } catch {
        socket.destroy();
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(path, () => resolve());
  });
  await chmod(path, 0o660);
  return server;
}
