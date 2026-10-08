import { createServer } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { ExpressAdapter } from "@nestjs/platform-express";
import type { Request, Response } from "express";
import { expect, it } from "vitest";
import { manualJsonBodyParser } from "./manual-body-parser.js";

it("allows large manual source while preserving other JSON routes and webhook bytes", async () => {
  const adapter = new ExpressAdapter();
  adapter.use("/api/manual", manualJsonBodyParser());
  adapter.registerParserMiddleware("", true);
  const app = adapter.getInstance();
  app.post("/api/manual", (req: Request, res: Response) =>
    res.json({ length: req.body.source.length }),
  );
  app.post("/api/documents", (req: Request, res: Response) => res.json(req.body));
  app.post("/webhook", (req: Request & { rawBody: Buffer }, res: Response) =>
    res.send(req.rawBody),
  );
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  async function post(path: string, body: string) {
    return fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  }
  try {
    const document = await post("/api/documents", '{"title":"PDF lesson"}');
    expect(document.status).toBe(200);
    expect(await document.json()).toEqual({ title: "PDF lesson" });
    const source = "x".repeat(300000);
    const manual = await post("/api/manual", JSON.stringify({ source }));
    expect(manual.status).toBe(200);
    expect(await manual.json()).toEqual({ length: source.length });
    const raw = '{ "event": "delivered", "sequence": 1 }';
    expect(await (await post("/webhook", raw)).text()).toBe(raw);
    expect((await post("/api/documents", JSON.stringify({ source }))).status).toBe(
      413,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
