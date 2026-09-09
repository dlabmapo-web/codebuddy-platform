import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { auditActionLabels } from './audit-action';

/*
 * The guard this file exists for.
 *
 * The label table was written from a grep, and the grep was wrong twice: the
 * first pattern excluded underscores, so every `visibility_changed` and
 * `adopted_from_library` was missing, and the second read only literals
 * written directly beside `action:`, so the conditional ones —
 * `input.retired ? "…retired" : "…restored"` — were missing too. Both times the
 * page shipped looking fixed and still printed dotted codes at an operator.
 *
 * A hand-maintained list cannot be trusted to stay complete, so this reads the
 * API's own source instead and fails when it writes an action nobody has
 * written a sentence for. `academyAuditActions` in `@cove/shared` guards its
 * own smaller vocabulary the same way, and for the same reason.
 */
const apiSource = fileURLToPath(
  new URL('../../../../../../../api/src', import.meta.url),
);

/** Every `.ts` file under the API, excluding generated code and specs. */
function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      return entry === 'generated' ? [] : sourceFiles(path);
    }
    return /\.ts$/.test(entry) && !/\.spec\.ts$/.test(entry) ? [path] : [];
  });
}

/**
 * The actions a file writes to the audit log.
 *
 * Scans the six lines after each `action:` rather than that line alone, which
 * is what the second grep got wrong: a conditional action puts its strings on
 * the lines below the key. Stops at the next known field so a long object
 * cannot pull in an unrelated string.
 */
function actionsWrittenIn(source: string): string[] {
  const lines = source.split('\n');
  const found: string[] = [];
  const literal = /"([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)"/g;
  const nextField = /^\s*(targetType|targetId|academyId|before|after|reason)\s*:/;

  lines.forEach((line, index) => {
    if (!/\baction:/.test(line)) return;
    for (let cursor = index; cursor < Math.min(index + 6, lines.length); cursor += 1) {
      const text = lines[cursor]!;
      if (cursor > index && nextField.test(text)) break;
      for (const match of text.matchAll(literal)) found.push(match[1]!);
    }
  });
  return found;
}

/**
 * Permissions are checked, never written, and share the dotted shape exactly.
 * Read from the one file that declares them so this cannot drift either.
 */
const permissions = new Set(
  [
    ...readFileSync(
      fileURLToPath(
        new URL('../../../../../../../shared/src/auth/roles.ts', import.meta.url),
      ),
      'utf8',
    ).matchAll(/"([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)"/g),
  ].map((match) => match[1]!),
);

describe('the audit vocabulary the console can name', () => {
  it('has a sentence for every action the API writes', () => {
    const written = new Set<string>();
    for (const file of sourceFiles(apiSource)) {
      for (const action of actionsWrittenIn(readFileSync(file, 'utf8'))) {
        if (!permissions.has(action)) written.add(action);
      }
    }

    // Proof the scan found anything at all: an empty set would make the
    // assertion below pass while checking nothing.
    expect(written.size).toBeGreaterThan(50);

    const unnamed = [...written]
      .filter((action) => !(action in auditActionLabels))
      .sort();
    expect(unnamed).toEqual([]);
  });
});
