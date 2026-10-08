import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ManualSession } from "@cove/shared";
@Injectable()
export class GuiClientService {
  constructor(private readonly config: ConfigService) {}
  assertEnabled() {
    if (this.config.get("GUI_ENABLED") !== true)
      throw new ServiceUnavailableException("Turtle authoring is not enabled");
  }
  async runtimeVersion(): Promise<string> {
    const health = (await this.request("/health")) as unknown as {
      runtimeVersion: string;
    };
    if (!health.runtimeVersion)
      throw new ServiceUnavailableException("Runtime version is unavailable");
    return health.runtimeVersion;
  }
  async request(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<ManualSession> {
    const secret = this.config.get<string>("GUI_SERVICE_SECRET");
    const base = this.config.get<string>("GUI_SERVICE_URL");
    if (this.config.get("GUI_ENABLED") !== true || !secret || !base)
      throw new ServiceUnavailableException("Turtle execution is not enabled");
    let response: Response;
    try {
      response = await fetch(base + path, {
        method,
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(45000),
      });
    } catch {
      throw new ServiceUnavailableException("Turtle runtime is unavailable");
    }
    const data = (await response.json()) as ManualSession & {
      message?: string;
    };
    if (!response.ok)
      throw new ServiceUnavailableException(
        data.message ?? "Turtle runtime is busy or unavailable",
      );
    const publicUrl = this.config.get<string>("GUI_PUBLIC_WS_URL");
    return { ...data, displayUrl: `${publicUrl}/sessions/${data.id}/display` };
  }
}
