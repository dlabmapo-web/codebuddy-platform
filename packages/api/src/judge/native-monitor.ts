import { createServer } from "node:http";
import { ExecutionTelemetry, renderExecutionTimings } from "./execution-telemetry.js";
/** Loopback only, no job identities, source, outputs or credentials. Disabled when port=0. */
export function startNativeMonitor(port: number, telemetry: ExecutionTelemetry, ready: () => Promise<boolean>) {
  const server = port ? createServer((request, response) => {
    response.setHeader("Cache-Control", "no-store");
    if (request.method !== "GET") { response.writeHead(405).end(); return; }
    if (request.url === "/metrics") { response.writeHead(200, { "Content-Type": "text/plain" }).end(renderExecutionTimings(telemetry.snapshot(), "judge") + "\n"); return; }
    if (request.url !== "/ready") { response.writeHead(404).end(); return; }
    void ready().then(value => response.writeHead(value ? 200 : 503).end(JSON.stringify({ ready: value })), () => response.writeHead(503).end('{"ready":false}'));
  }).listen(port, "127.0.0.1") : undefined;
  if (server) { server.maxConnections = 32; server.requestTimeout = 5000; server.headersTimeout = 5000; }
  return { async close() { if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); } };
}
