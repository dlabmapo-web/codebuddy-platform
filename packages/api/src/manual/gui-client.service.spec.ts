import { ConfigService } from "@nestjs/config";
import { afterEach, expect, it, vi } from "vitest";
import { GuiClientService } from "./gui-client.service.js";

const client = new GuiClientService(new ConfigService({
  GUI_ENABLED: true,
  GUI_SERVICE_SECRET: "test-secret",
  GUI_SERVICE_URL: "http://gui.test",
}));

afterEach(() => vi.unstubAllGlobals());

it("preserves an expired session's 404 so the workspace can enable Run", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({}, { status: 404 })));
  await expect(client.request("/sessions/old")).rejects.toMatchObject({ status: 404 });
});

it("reports a missing session creation endpoint as a service failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({}, { status: 404 })));
  await expect(client.request("/sessions", "POST", {})).rejects.toMatchObject({ status: 503 });
});
