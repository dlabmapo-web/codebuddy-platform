import type {
  AcademyStatus,
  DlabCampus,
  Prisma,
} from "../../generated/prisma/client.js";
import { DlabError } from "./dlab-error.js";
import { sourceWrite } from "./dlab-transaction.js";

export function projectedCampusStatus(
  status: string,
  restriction: AcademyStatus | null,
): AcademyStatus {
  return restriction === "ARCHIVED"
    ? "ARCHIVED"
    : restriction === "SUSPENDED" || status !== "active"
      ? "SUSPENDED"
      : "ACTIVE";
}
/** Caller holds source lock. Source name/status never changes UUIDs or slugs. */
export async function projectDlabCampus(
  tx: Prisma.TransactionClient,
  campus: DlabCampus,
  requestId?: string,
) {
  if (!campus.academyId)
    return { changed: false, statusChanged: false, closed: false };
  const academy = await tx.academy.findUniqueOrThrow({
    where: { id: campus.academyId },
    select: { id: true, kind: true, name: true, status: true },
  });
  if (academy.kind !== "ACADEMY")
    throw new DlabError("campus_mapping_conflict", 409);
  const status = projectedCampusStatus(
    campus.status,
    campus.localAcademyRestriction,
  );
  const statusChanged = academy.status !== status;
  const changed = statusChanged || academy.name !== campus.name;
  if (!changed) return { changed, statusChanged, closed: false };
  await sourceWrite(tx);
  await tx.academy.update({
    where: { id: academy.id },
    data: {
      name: campus.name,
      status,
      ...(statusChanged ? { statusChangedAt: new Date() } : {}),
    },
  });
  await tx.dlabIntegrationEvent.create({
    data: {
      requestId,
      action: "campus.projected",
      details: {
        externalCampusId: campus.externalCampusId,
        academyId: academy.id,
        before: { name: academy.name, status: academy.status },
        after: { name: campus.name, status },
      },
    },
  });
  return {
    changed,
    statusChanged,
    closed: statusChanged && status !== "ACTIVE",
  };
}
