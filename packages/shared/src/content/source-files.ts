import { z } from "zod";

import { gradingDataLimits } from "../grading-limits.js";

/**
 * Multi-file C and C++ exercises.
 *
 * Design: docs/superpowers/specs/2026-11-19-c-cpp-multi-file-design.md.
 *
 * An exercise that has a *project* gives the learner several files. The
 * author's side (`ExerciseProject`) lists every file with its flags and says
 * which ones are compiled. The learner's side travels as one string, a *file
 * bundle*, in the same `code` field every draft, check, submission, history
 * entry and live document already carries:
 *
 * ```
 * //@cove-file main.c
 * #include "sum.h"
 * ...
 * //@cove-file sum.c
 * ...
 * ```
 *
 * The marker is a C comment, so a reader that predates projects shows a
 * readable program rather than an encoded blob. File contents are stored raw,
 * which keeps offsets within a file plain for live collaboration. A line that
 * starts with the marker is reserved and refused inside a file.
 */

export const FILE_BUNDLE_MARKER = "//@cove-file ";
const reservedLine = /(^|\n)\/\/@cove-file/;

export const sourceFileLimits = {
  /** Files in one project, author and learner files together. */
  files: 32,
  /** Characters in one file, and in the whole set: today's single-file cap. */
  chars: gradingDataLimits.codeChars,
  pathSegments: 4,
} as const;

export type CompiledLanguage = "C" | "CPP";

/** Every extension a file may have, per language. Headers are never compiled. */
const extensionsFor: Record<CompiledLanguage, readonly string[]> = {
  C: [".c", ".h"],
  CPP: [".cpp", ".cc", ".c", ".h", ".hpp"],
};
const compiledExtensionsFor: Record<CompiledLanguage, readonly string[]> = {
  C: [".c"],
  CPP: [".cpp", ".cc", ".c"],
};

/**
 * One path segment: never `-…` (a compiler option once on a command line),
 * never `.`, `..` or a dotfile.
 */
const segmentPattern = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/;

export type SourcePathError = "path_invalid" | "path_extension";

/** Why a path cannot be a file of this language, or null when it can. */
export function sourcePathError(path: string, language: CompiledLanguage): SourcePathError | null {
  const segments = path.split("/");
  if (
    segments.length > sourceFileLimits.pathSegments ||
    segments.some((segment) => !segmentPattern.test(segment))
  )
    return "path_invalid";
  const lower = path.toLowerCase();
  return extensionsFor[language].some((extension) => lower.endsWith(extension))
    ? null
    : "path_extension";
}

export function isCompiledSource(path: string, language: CompiledLanguage): boolean {
  const lower = path.toLowerCase();
  return compiledExtensionsFor[language].some((extension) => lower.endsWith(extension));
}

/** The extensions a learner may name a new file with, for hints and pickers. */
export function sourceExtensionsFor(language: CompiledLanguage): readonly string[] {
  return extensionsFor[language];
}

export type BundleFile = { path: string; content: string };

export function isFileBundle(code: string): boolean {
  return code.startsWith(FILE_BUNDLE_MARKER);
}

/** One string from files, in order. The inverse of `decodeFileBundle`. */
export function encodeFileBundle(files: readonly BundleFile[]): string {
  return files.map((file) => `${FILE_BUNDLE_MARKER}${file.path}\n${file.content}`).join("\n");
}

/**
 * The files in a bundle, in order, or null when `code` is not one.
 *
 * Tolerant of a carriage return at the end of a marker line, which a pasted
 * Windows buffer can leave; contents are returned exactly as stored.
 */
export function decodeFileBundle(code: string): BundleFile[] | null {
  if (!isFileBundle(code)) return null;
  const files: BundleFile[] = [];
  let current: { path: string; lines: string[] } | null = null;
  for (const line of code.split("\n")) {
    if (line.startsWith(FILE_BUNDLE_MARKER)) {
      if (current) files.push({ path: current.path, content: current.lines.join("\n") });
      current = { path: line.slice(FILE_BUNDLE_MARKER.length).replace(/\r$/, ""), lines: [] };
    } else current!.lines.push(line);
  }
  if (current) files.push({ path: current.path, content: current.lines.join("\n") });
  return files;
}

/** Whether a file's content would break the bundle it is stored in. */
export function hasReservedLine(content: string): boolean {
  return reservedLine.test(content);
}

/* --------------------------------------------------------------- author side */

export const exerciseFileTreeModes = ["CLOSED", "OPEN", "DISABLED"] as const;
export type ExerciseFileTreeMode = (typeof exerciseFileTreeModes)[number];

export const exerciseProjectFileSchema = z
  .object({
    path: z.string().min(1).max(256),
    content: z.string().max(sourceFileLimits.chars),
    /** Shown but not editable; the server always compiles the author's text. */
    readOnly: z.boolean(),
    /** Compiled and present, never sent to a learner. */
    hidden: z.boolean(),
    /** Opened as a tab when the learner arrives. */
    openByDefault: z.boolean(),
  })
  .strict();
export type ExerciseProjectFile = z.infer<typeof exerciseProjectFileSchema>;

export const exerciseProjectSchema = z
  .object({
    version: z.literal(1),
    files: z.array(exerciseProjectFileSchema).min(1).max(sourceFileLimits.files),
    /** Compiled files, in compile order. Headers never appear here. */
    sources: z.array(z.string()).min(1).max(sourceFileLimits.files),
    /** Also compile the source files a learner creates (Elice's `gcc *.c`). */
    includeLearnerSources: z.boolean(),
    fileTree: z.enum(exerciseFileTreeModes),
  })
  .strict()
  .superRefine((project, ctx) => {
    for (const issue of projectStructureIssues(project))
      ctx.addIssue({ code: "custom", message: issue });
  });
export type ExerciseProject = z.infer<typeof exerciseProjectSchema>;

/** Rules that need no language; `exerciseProjectIssues` adds the rest. */
function projectStructureIssues(project: Omit<ExerciseProject, "version"> & { version?: number }): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const file of project.files) {
    const key = file.path.toLowerCase();
    if (seen.has(key)) issues.push(`Duplicate file ${file.path}`);
    seen.add(key);
    if (file.hidden && (file.openByDefault || file.readOnly))
      issues.push(`Hidden file ${file.path} cannot be read-only or open by default`);
    if (hasReservedLine(file.content))
      issues.push(`${file.path} contains a line starting with //@cove-file`);
  }
  if (!project.files.some((file) => file.openByDefault && !file.hidden))
    issues.push("At least one visible file must open by default");
  const paths = new Set(project.files.map((file) => file.path));
  if (new Set(project.sources).size !== project.sources.length) issues.push("A file is compiled twice");
  for (const source of project.sources)
    if (!paths.has(source)) issues.push(`Compiled file ${source} does not exist`);
  const total = project.files.reduce((sum, file) => sum + file.content.length, 0);
  if (total > sourceFileLimits.chars) issues.push("The files exceed 100,000 characters together");
  return issues;
}

/** Every reason a project cannot belong to an exercise of this language. */
export function exerciseProjectIssues(project: ExerciseProject, language: CompiledLanguage): string[] {
  const issues = projectStructureIssues(project);
  for (const file of project.files) {
    const error = sourcePathError(file.path, language);
    if (error) issues.push(`${file.path}: ${error === "path_extension" ? "extension not allowed" : "invalid path"}`);
  }
  for (const source of project.sources)
    if (!isCompiledSource(source, language)) issues.push(`${source} cannot be compiled`);
  return issues;
}

/** The bundle a learner starts from: every visible author file, in order. */
export function starterBundleFor(project: ExerciseProject): string {
  return encodeFileBundle(
    project.files.filter((file) => !file.hidden).map(({ path, content }) => ({ path, content })),
  );
}

/* -------------------------------------------------------------- learner side */

export const learnerProjectFileSchema = z
  .object({
    path: z.string(),
    readOnly: z.boolean(),
    openByDefault: z.boolean(),
    /** In the author's compile list. */
    compiled: z.boolean(),
  })
  .strict();

/**
 * What a learner's workspace knows about a project: the visible author files
 * and the rules for their own. Never a hidden path, and never content (that is
 * the starter bundle).
 */
export const learnerProjectSchema = z
  .object({
    files: z.array(learnerProjectFileSchema),
    includeLearnerSources: z.boolean(),
    fileTree: z.enum(exerciseFileTreeModes),
  })
  .strict();
export type LearnerProject = z.infer<typeof learnerProjectSchema>;

export function learnerProjectFor(project: ExerciseProject): LearnerProject {
  const compiled = new Set(project.sources);
  return {
    files: project.files
      .filter((file) => !file.hidden)
      .map((file) => ({
        path: file.path,
        readOnly: file.readOnly,
        openByDefault: file.openByDefault,
        compiled: compiled.has(file.path),
      })),
    includeLearnerSources: project.includeLearnerSources,
    fileTree: project.fileTree,
  };
}

export type ComposeFailure =
  | "bundle_invalid"
  | "path_invalid"
  | "path_extension"
  | "path_reserved"
  | "path_duplicate"
  | "reserved_line"
  | "too_many_files"
  | "too_large";

export type ComposedProject =
  | { ok: true; files: BundleFile[]; sources: string[]; hiddenPaths: string[] }
  | { ok: false; reason: ComposeFailure; path?: string };

/**
 * The files a learner's attempt compiles, from the author's project and the
 * learner's bundle.
 *
 * The learner never chooses what a read-only or hidden file says: those come
 * from the project, whatever the bundle holds. An editable author file takes
 * the learner's text, or the author's when the bundle lacks it. Every other
 * path is the learner's own file, checked like an author's, and compiled only
 * when the project says so.
 */
export function composeProject(
  project: ExerciseProject,
  learnerCode: string,
  language: CompiledLanguage,
): ComposedProject {
  const learner = decodeFileBundle(learnerCode);
  if (!learner) return { ok: false, reason: "bundle_invalid" };
  const authorByKey = new Map(project.files.map((file) => [file.path.toLowerCase(), file]));
  const learnerByPath = new Map<string, string>();
  const ownFiles: BundleFile[] = [];
  const ownKeys = new Set<string>();
  for (const file of learner) {
    const author = authorByKey.get(file.path.toLowerCase());
    if (author) {
      if (author.hidden) return { ok: false, reason: "path_reserved", path: file.path };
      if (author.path !== file.path) return { ok: false, reason: "path_duplicate", path: file.path };
      if (learnerByPath.has(file.path)) return { ok: false, reason: "path_duplicate", path: file.path };
      learnerByPath.set(file.path, file.content);
      continue;
    }
    const error = sourcePathError(file.path, language);
    if (error) return { ok: false, reason: error, path: file.path };
    const key = file.path.toLowerCase();
    if (ownKeys.has(key)) return { ok: false, reason: "path_duplicate", path: file.path };
    ownKeys.add(key);
    ownFiles.push(file);
  }
  const files: BundleFile[] = [
    ...project.files.map((file) => ({
      path: file.path,
      content: file.readOnly || file.hidden ? file.content : (learnerByPath.get(file.path) ?? file.content),
    })),
    ...ownFiles,
  ];
  if (files.length > sourceFileLimits.files) return { ok: false, reason: "too_many_files" };
  for (const file of files)
    if (hasReservedLine(file.content)) return { ok: false, reason: "reserved_line", path: file.path };
  if (files.reduce((sum, file) => sum + file.content.length, 0) > sourceFileLimits.chars)
    return { ok: false, reason: "too_large" };
  const sources = [
    ...project.sources,
    ...(project.includeLearnerSources
      ? ownFiles.map((file) => file.path).filter((path) => isCompiledSource(path, language))
      : []),
  ];
  return {
    ok: true,
    files,
    sources,
    hiddenPaths: project.files.filter((file) => file.hidden).map((file) => file.path),
  };
}

/**
 * GCC's text with every source excerpt from a hidden file removed.
 *
 * GCC quotes the offending line under each located message (`  6 | x = 1;`
 * and a caret line). For a hidden file that quote is the author's code, so it
 * is replaced, once per message, with a placeholder; the location and the
 * message stay, which is what a learner needs to fix their own side.
 */
export function redactHiddenDiagnostics(text: string, hiddenPaths: readonly string[]): string {
  if (hiddenPaths.length === 0 || text === "") return text;
  const located = /^(?:In file included from |\s+from )?([^\s:][^:]*):\d+(?::\d+)?[:,]/;
  const excerpt = /^\s*\d*\s*\|/;
  const hidden = new Set(hiddenPaths);
  const out: string[] = [];
  let inHidden = false;
  let redacted = false;
  for (const line of text.split("\n")) {
    if (excerpt.test(line)) {
      if (!inHidden) out.push(line);
      else if (!redacted) {
        out.push("      | (hidden file)");
        redacted = true;
      }
      continue;
    }
    const match = located.exec(line);
    if (match) {
      inHidden = hidden.has(match[1]!.replace(/^\.\//, ""));
      redacted = false;
    } else if (/^[^\s:]+: (In|At) /.test(line)) {
      inHidden = hidden.has(line.split(":")[0]!.replace(/^\.\//, ""));
      redacted = false;
    }
    out.push(line);
  }
  return out.join("\n");
}
