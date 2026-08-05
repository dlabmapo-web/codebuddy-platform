import { describe, expect, it } from "vitest";
import { isAppErrorCode } from "@cove/shared";

import { AppException } from "../common/app-exception.js";
import {
  monitoringLogLine,
  toPublicErrorCode,
} from "./monitoring-event-mapper.js";

describe("toPublicErrorCode", () => {
  it("passes an application failure through unchanged", () => {
    expect(toPublicErrorCode(new AppException("MONITORING_DISABLED", 403))).toBe(
      "MONITORING_DISABLED",
    );
  });

  it("accepts a plain error carrying a public code", () => {
    expect(
      toPublicErrorCode(
        Object.assign(new Error("denied"), {
          code: "MONITORING_STUDENT_UNAVAILABLE",
        }),
      ),
    ).toBe("MONITORING_STUDENT_UNAVAILABLE");
  });

  it("reduces a database failure to a generic denial", () => {
    const prismaError = Object.assign(
      new Error('relation "classes" does not exist'),
      { code: "P2021" },
    );
    expect(toPublicErrorCode(prismaError)).toBe("MONITORING_ACCESS_DENIED");
  });

  it("never returns a code outside the public vocabulary", () => {
    for (const error of [
      new Error("ECONNREFUSED 127.0.0.1:6379"),
      "a string",
      null,
      { code: 42 },
    ]) {
      expect(isAppErrorCode(toPublicErrorCode(error))).toBe(true);
    }
  });
});

describe("monitoringLogLine", () => {
  it("writes ids, reasons, and sizes", () => {
    expect(
      monitoringLogLine({
        event: "student.watch.start",
        classId: "class-1",
        reason: "MONITORING_ACCESS_DENIED",
        durationMs: 12,
      }),
    ).toBe(
      "event=student.watch.start classId=class-1 reason=MONITORING_ACCESS_DENIED durationMs=12",
    );
  });

  it("omits absent fields rather than logging undefined", () => {
    expect(monitoringLogLine({ event: "class.join" })).toBe("event=class.join");
  });

  it("has no field for a token, a name, code, or a coordinate", () => {
    const line = monitoringLogLine({
      event: "document.update",
      draftId: "draft-1",
      bytes: 128,
    });
    expect(line).toBe("event=document.update draftId=draft-1 bytes=128");
  });
});
