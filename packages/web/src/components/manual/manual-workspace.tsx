"use client";
import { useManualTranslation } from "./use-manual-translation";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { ManualSession } from "@cove/shared";
import { manualApi } from "@/lib/manual-api";
import { routes } from "@/lib/routes";
import { useAcademySlug } from "@/components/studio/academy-route-provider";
import { CodeEditor } from "@/app/(studio)/academy/[academySlug]/learn/exercises/[materialId]/_components/code-editor";
import { RichTextFrame } from "@/components/studio/rich-text-frame";
import { GuiViewer } from "./gui-viewer";
export function ManualWorkspace({
  academyId,
  materialId,
  classId,
  preview = false,
}: {
  academyId: string;
  materialId: string;
  classId?: string;
  preview?: boolean;
}) {
  const { t: mt } = useManualTranslation();
  const slug = useAcademySlug();
  const [deliveryClass, setDeliveryClass] = useState(classId);
  const target = { academyId, materialId };
  const query = useQuery({
    queryKey: ["manual", academyId, materialId, preview, deliveryClass],
    queryFn: () =>
      manualApi.read({ ...target, preview, classId: deliveryClass }),
    retry: false,
  });
  const data = query.data;
  const [files, setFiles] = useState<Record<string, string>>({});
  const [answer, setAnswer] = useState("");
  const [selected, setSelected] = useState("main.py");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState("");
  const [session, setSession] = useState<ManualSession | null>(null);
  const [input, setInput] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [executionTab, setExecutionTab] = useState<"drawing" | "terminal">(
    "drawing",
  );
  const [dirty, setDirty] = useState(false);
  const pendingSubmit = useRef<{ key: string; content: string } | null>(null);
  const saving = useRef<Promise<void> | null>(null);
  const draftRevision = useRef(0);
  const loaded = useRef(false);
  const active = useRef<string | null>(null);
  const connectionFailed = useRef(false);
  const latest = useRef({ files, answer });
  latest.current = { files, answer };
  const showError = useCallback((text: string) => setError(text), []);
  useEffect(() => {
    if (!data || loaded.current) return;
    loaded.current = true;
    setFiles(data.draft?.files ?? data.config.files);
    setAnswer(data.draft?.answer ?? "");
    draftRevision.current = data.draft?.revision ?? 0;
    setSelected(data.config.entryPoint);
  }, [data]);
  useEffect(
    () => () => {
      if (active.current) void manualApi.stop(active.current).catch(() => {});
    },
    [],
  );
  useEffect(() => {
    if (
      !session ||
      !["RUNNING", "STARTING", "QUEUED", "WAITING_INPUT"].includes(
        session.state,
      )
    )
      return;
    let cancelled = false;
    let inFlight = false;
    const timer = setInterval(() => {
      if (inFlight) return;
      inFlight = true;
      void manualApi
        .status(session.id)
        .then((next) => {
          if (!cancelled) {
            setSession(next);
            if (connectionFailed.current) {
              connectionFailed.current = false;
              setError("");
            }
          }
        })
        .catch((e) => {
          if (!cancelled) {
            connectionFailed.current = true;
            setError(e.message);
            if ([401, 403, 404].includes(e.status))
              setSession((old) =>
                old ? { ...old, state: "DISCONNECTED" } : null,
              );
          }
        })
        .finally(() => {
          inFlight = false;
        });
    }, 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [session?.id, session?.state]);
  const running =
    session &&
    ["RUNNING", "STARTING", "QUEUED", "WAITING_INPUT"].includes(session.state);
  async function save() {
    if (preview) return;
    if (saving.current) return saving.current;
    const snapshot = latest.current;
    const operation = (async () => {
      setError("");
      try {
        const result = await manualApi.draft({
          ...target,
          ...latest.current,
          revision: draftRevision.current,
        });
        draftRevision.current = result.revision;
        if (
          latest.current.files === snapshot.files &&
          latest.current.answer === snapshot.answer
        )
          setDirty(false);
        setSaved(mt("saved"));
      } catch (e) {
        setError(e instanceof Error ? e.message : mt("could_not_save"));
      } finally {
        saving.current = null;
      }
    })();
    saving.current = operation;
    return operation;
  }
  useEffect(() => {
    if (preview || !dirty) return;
    const timer = setTimeout(() => void save(), 1500);
    return () => clearTimeout(timer);
  }, [files, answer, dirty, preview]);
  const selectedClass =
    deliveryClass ??
    (data?.classes.length === 1 ? data.classes[0].classId : undefined);
  async function run(solution = false) {
    setBusy(true);
    setError("");
    try {
      if (active.current) await manualApi.stop(active.current);
      const next = await manualApi.start({
        ...target,
        ...latest.current,
        contentRevision: data!.config.revision,
        revision: draftRevision.current,
        preview,
        solution,
      });
      active.current = next.id;
      setSession(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : mt("run_failed"));
    } finally {
      setBusy(false);
    }
  }
  async function stop() {
    if (!active.current) return;
    setBusy(true);
    try {
      await manualApi.stop(active.current);
      active.current = null;
      setSession((s) => (s ? { ...s, state: "STOPPED" } : null));
    } catch (e) {
      setError(e instanceof Error ? e.message : mt("stop_failed"));
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (!selectedClass) {
      setError(mt("open_this_activity_from_your_class_to_submit"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const content = JSON.stringify({
        ...latest.current,
        classId: selectedClass,
        revision: data!.config.revision,
      });
      if (pendingSubmit.current?.content !== content)
        pendingSubmit.current = { content, key: crypto.randomUUID() };
      await manualApi.submit({
        ...target,
        ...latest.current,
        contentRevision: data!.config.revision,
        revision: draftRevision.current,
        classId: selectedClass,
        requestKey: pendingSubmit.current.key,
      });
      pendingSubmit.current = null;
      await query.refetch();
      setSaved(mt("submitted_awaiting_teacher_review"));
    } catch (e) {
      setError(e instanceof Error ? e.message : mt("submit_failed"));
    } finally {
      setBusy(false);
    }
  }
  const path = (m: { type: string; materialId: string }) =>
    m.type === "PDF_DOCUMENT"
      ? routes.academyLearnPdf(slug, m.materialId, { classId: selectedClass })
      : m.type === "PROGRAMMING_EXERCISE"
        ? routes.academyLearnExercise(slug, m.materialId, {
            classId: selectedClass,
          })
        : routes.academyLearnManual(slug, m.materialId, {
            classId: selectedClass,
          });
  if (!data)
    return (
      <main className="p-6" role={query.isError ? "alert" : "status"}>
        {query.isError
          ? mt("material_is_not_available")
          : mt("loading_activity")}
      </main>
    );
  const index = data.materials.findIndex((m) => m.materialId === materialId);
  const previous = data.materials[index - 1],
    next = data.materials[index + 1];
  const attempts = data.attempts.filter((a) => a.classId === selectedClass);
  const attempt = attempts[0],
    review = attempt?.reviews[0];
  return (
    <main className="flex min-h-dvh flex-col bg-canvas text-ink md:h-dvh md:overflow-hidden">
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-card p-3">
        <Link
          href={routes.academyLearnCourse(slug, data.course.id, { classId })}
        >
          ← {data.course.title}
        </Link>
        <h1 className="flex-1 font-bold">{data.title}</h1>
        <span className="text-xs">
          {mt("teacher_graded")}{" "}
          {data.config.includeInScore
            ? mt("included_in_score")
            : mt("excluded_from_score")}
        </span>
        <button type="button" onClick={() => setDrawer((v) => !v)}>
          {mt("materials")}
        </button>
      </header>
      {error ? (
        <p className="bg-danger/10 p-3 text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="max-h-[30vh] overflow-auto border-b border-border bg-card p-5 md:max-h-none md:w-1/3 md:border-r">
          <RichTextFrame
            content={data.config.description}
            title={mt("activity_instructions")}
          />
          {preview && data.config.solutionFiles ? (
            <details className="mt-4">
              <summary>{mt("view_solution")}</summary>
              <pre className="overflow-auto whitespace-pre-wrap">
                {Object.values(data.config.solutionFiles).join("\n")}
              </pre>
              <button
                type="button"
                disabled={busy || Boolean(running)}
                onClick={() => void run(true)}
              >
                {mt("run_solution")}
              </button>
            </details>
          ) : null}
          {preview && data.config.modelAnswer ? (
            <details>
              <summary>{mt("model_answer_private")}</summary>
              <p className="whitespace-pre-wrap">{data.config.modelAnswer}</p>
            </details>
          ) : null}
          {attempt ? (
            <section className="mt-4 rounded border border-border p-3">
              <h2 className="font-bold">{mt("last_submission")}</h2>
              <p>{new Date(attempt.createdAt).toLocaleString()}</p>
              <p>
                {review
                  ? `${review.scoreHundredths / 100} / ${attempt.maximumHundredths / 100} · ${review.completed ? mt("completed") : mt("needs_revision")}`
                  : mt("awaiting_teacher_review")}
              </p>
              {review ? (
                <p className="whitespace-pre-wrap">{review.feedback}</p>
              ) : null}
              <details className="mt-3">
                <summary>
                  {mt("submission")} ({attempts.length})
                </summary>
                {attempts.map((old) => (
                  <article
                    className="my-2 rounded border border-border p-2"
                    key={old.id}
                  >
                    <p>
                      {new Date(old.createdAt).toLocaleString()} ·{" "}
                      {old.reviews[0]
                        ? `${old.reviews[0].scoreHundredths / 100} / ${old.maximumHundredths / 100}`
                        : mt("awaiting_review")}
                    </p>
                    <details>
                      <summary>{mt("read_only")}</summary>
                      <pre className="overflow-auto whitespace-pre-wrap">
                        {data.type === "WRITTEN_RESPONSE"
                          ? old.answer
                          : Object.entries(old.files)
                              .map(([name, code]) => `${name}\n${code}`)
                              .join("\n")}
                      </pre>
                    </details>
                    {old.reviews.map((r) => (
                      <p key={r.id}>
                        {mt("version", { version: r.version })} ·{" "}
                        {r.scoreHundredths / 100} · {r.feedback}
                      </p>
                    ))}
                  </article>
                ))}
              </details>
            </section>
          ) : null}
          {drawer ? (
            <nav className="mt-5 grid gap-2">
              {data.materials.map((m) => (
                <Link
                  key={m.materialId}
                  href={path(m)}
                  aria-current={
                    m.materialId === materialId ? "page" : undefined
                  }
                >
                  {m.title}
                </Link>
              ))}
            </nav>
          ) : null}
        </aside>
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          {data.type === "TURTLE_EXERCISE" ? (
            <>
              <div className="flex gap-2 overflow-auto bg-editor-bg p-2 text-white">
                {Object.keys(files).map((name) => (
                  <button
                    key={name}
                    type="button"
                    className={selected === name ? "font-bold underline" : ""}
                    onClick={() => setSelected(name)}
                  >
                    {name}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const name = window.prompt(mt("python_file_name"));
                    if (name && !Object.hasOwn(files, name)) {
                      setFiles({ ...files, [name]: "" });
                      setSelected(name);
                    }
                  }}
                >
                  {mt("file")}
                </button>
              </div>
              <div className="flex min-h-[220px] flex-[1] flex-col">
                <CodeEditor
                  code={files[selected] ?? ""}
                  fontSize={14}
                  onChange={(value) => {
                    setFiles({ ...files, [selected]: value });
                    setDirty(true);
                    setSaved(mt("unsaved_changes"));
                  }}
                />
              </div>
            </>
          ) : (
            <label className="flex flex-1 flex-col p-5">
              {data.config.hint || mt("your_answer")}
              <textarea
                className="mt-3 min-h-[260px] rounded border border-border bg-card p-3"
                aria-label={mt("your_answer")}
                maxLength={10000}
                value={answer}
                onChange={(e) => {
                  setAnswer(e.target.value);
                  setDirty(true);
                  setSaved(mt("unsaved_changes"));
                }}
              />
            </label>
          )}
          <div className="flex flex-wrap items-center gap-3 border-y border-border bg-card p-3">
            {data.type === "TURTLE_EXERCISE" ? (
              <>
                <button
                  className="rounded bg-brand px-4 py-2 text-white"
                  disabled={busy || Boolean(running)}
                  type="button"
                  onClick={() => void run()}
                >
                  {mt("run")}
                </button>
                <button
                  disabled={busy || !running}
                  type="button"
                  onClick={() => void stop()}
                >
                  {mt("stop")}
                </button>
              </>
            ) : null}
            {!preview ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void save()}
                >
                  {mt("save_code")}
                </button>
                {data.config.submitEnabled ? (
                  <button
                    className="rounded border border-border px-4 py-2"
                    type="button"
                    disabled={busy}
                    onClick={() => void submit()}
                  >
                    {mt("submit")}
                  </button>
                ) : null}
              </>
            ) : null}
            {!preview && data.classes.length > 1 ? (
              <select
                aria-label={mt("submission_class")}
                className="border border-border bg-card p-2"
                value={selectedClass ?? ""}
                onChange={(e) => setDeliveryClass(e.target.value)}
              >
                <option value="">{mt("choose_class")}</option>
                {data.classes.map((c) => (
                  <option key={c.classId} value={c.classId}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : null}
            <span role="status" className="text-xs">
              {saved} {session?.state}{" "}
              {session?.exitCode !== undefined
                ? mt("exit_code", { code: session.exitCode })
                : null}
              {running
                ? mt("seconds_remaining", {
                    count: Math.max(
                      0,
                      Math.ceil((session!.expiresAt - Date.now()) / 1000),
                    ),
                  })
                : ""}
            </span>
          </div>
          {data.type === "TURTLE_EXERCISE" ? (
            <>
              <div
                role="tablist"
                className="flex gap-4 border-b border-border p-2 md:hidden"
              >
                <button
                  role="tab"
                  aria-selected={executionTab === "drawing"}
                  onClick={() => setExecutionTab("drawing")}
                >
                  {mt("drawing")}
                </button>
                <button
                  role="tab"
                  aria-selected={executionTab === "terminal"}
                  onClick={() => setExecutionTab("terminal")}
                >
                  {mt("terminal")}
                </button>
              </div>
              <div className="flex min-h-[280px] flex-[1] flex-col lg:flex-row">
                <div
                  className={
                    "min-h-[280px] md:min-h-0 min-w-0 flex-1 flex-col md:flex " +
                    (executionTab === "drawing" ? "flex" : "hidden")
                  }
                >
                  {session ? (
                    <GuiViewer session={session} onError={showError} />
                  ) : (
                    <div className="grid flex-1 place-items-center bg-white text-slate-600">
                      {mt("run_python_to_open_the_drawing")}
                    </div>
                  )}
                </div>
                <section
                  className={
                    "min-h-[120px] min-w-0 flex-1 flex-col bg-editor-bg p-3 text-white md:flex " +
                    (executionTab === "terminal" ? "flex" : "hidden")
                  }
                  aria-label={mt("terminal")}
                >
                  <pre
                    className="max-h-[200px] flex-1 overflow-auto whitespace-pre-wrap text-xs"
                    data-testid="turtle-terminal"
                  >
                    {session?.output}
                  </pre>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (session) {
                        void manualApi
                          .input(session.id, input)
                          .then(() => setInput(""))
                          .catch((e) => setError(e.message));
                      }
                    }}
                  >
                    <input
                      className="w-full border-t border-white/20 bg-transparent p-2 text-sm"
                      aria-label={mt("terminal_input")}
                      placeholder={mt("terminal_input")}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      disabled={!running}
                    />
                  </form>
                </section>
              </div>
            </>
          ) : null}
        </section>
      </div>
      <footer className="flex shrink-0 justify-center gap-5 border-t border-border bg-card p-3">
        {previous ? <Link href={path(previous)}>{mt("previous")}</Link> : null}
        <span>
          {index + 1} / {data.materials.length}
        </span>
        {next ? <Link href={path(next)}>{mt("next")}</Link> : null}
      </footer>
    </main>
  );
}
