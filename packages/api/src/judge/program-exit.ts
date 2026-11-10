import { programExitSignalSchema, type ProgramExitSignal } from "@cove/shared";

/**
 * A stored case's ending as the shared contract names it. Who may read it is
 * the caller's decision: a hidden case's ending is withheld from students.
 */
export function programExit(item: { exitCode: number | null; exitSignal: string | null }): {
  exitCode: number | null;
  exitSignal: ProgramExitSignal | null;
} {
  const signal = programExitSignalSchema.safeParse(item.exitSignal);
  return { exitCode: item.exitCode, exitSignal: signal.success ? signal.data : null };
}
