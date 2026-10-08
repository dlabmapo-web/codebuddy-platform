import { json, type RequestHandler } from "express";

export function manualJsonBodyParser(): RequestHandler {
  const parse = json({ limit: "6mb" });
  // Nest detects its default parser by middleware name. Registering Express's
  // jsonParser directly on one path would suppress JSON parsing everywhere.
  return function parseManualJson(request, response, next) {
    parse(request, response, next);
  };
}
