"use client";
import { createContext, useContext } from "react";
import type { MaterialType } from "@cove/shared";
import type { MonitoringConnectionState } from "./connection";
export const HistoryPresentationContext = createContext<{
  covered: boolean;
  revoke: () => void;
  setConnection: (state: MonitoringConnectionState) => void;
  open: (mode: "student" | "material") => void;
  setMaterial: (
    id: string | null,
    courseId?: string,
    type?: MaterialType,
    title?: string,
  ) => void;
  materialId?: string | null;
  selectedStudent?: { membershipId: string; name: string } | null;
  selectStudent?: (student: { membershipId: string; name: string }) => void;
  registerOutlet?: (element: HTMLDivElement | null) => void;
  setGradingGuard?: (guard: (() => boolean) | null) => void;
  setLeaveGuard?: (prepare: (() => Promise<boolean>) | null) => void;
  beforeNavigate?: () => Promise<boolean>;
  prepareMaterialChange?: () => boolean;
} | null>(null);
export function useHistoryCovered() {
  return useContext(HistoryPresentationContext)?.covered ?? false;
}
