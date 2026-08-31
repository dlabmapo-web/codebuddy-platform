'use client';

import { Check, Copy } from 'lucide-react';
import dynamic from 'next/dynamic';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  Modal,
  ModalContent,
  ModalTrigger,
} from '@/components/studio/primitives';
import { orpc } from '@/lib/orpc';
import { registerPaircodeTheme } from '@/lib/monaco/theme';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
});

export function AnswerCodeModal({
  academyId,
  classId,
  membershipId,
  materialId,
  visitId,
  hasSolution,
  fontSize,
}: {
  academyId: string;
  classId: string;
  membershipId: string;
  materialId: string;
  visitId: string;
  hasSolution: boolean;
  fontSize: number;
}) {
  const { t } = useTranslation('monitoring');
  const [open, setOpen] = React.useState(false);
  const [code, setCode] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [copyFailed, setCopyFailed] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const requestRef = React.useRef(0);

  const clear = React.useCallback(() => {
    requestRef.current += 1;
    setCode(null);
    setLoading(false);
    setFailed(false);
    setCopied(false);
    setCopyFailed(false);
  }, []);

  React.useEffect(() => clear, [clear, materialId, visitId]);

  async function load() {
    const request = requestRef.current + 1;
    requestRef.current = request;
    setLoading(true);
    setFailed(false);
    try {
      const answer = await orpc.monitoring.getExerciseSolution({
        academyId,
        classId,
        membershipId,
        materialId,
        visitId,
      });
      if (requestRef.current === request) setCode(answer.solutionCode);
    } catch {
      if (requestRef.current === request) setFailed(true);
    } finally {
      if (requestRef.current === request) setLoading(false);
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) void load();
    else clear();
  }

  async function copyAnswer() {
    if (code === null) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      setCopyFailed(true);
    }
  }

  return (
    <Modal onOpenChange={handleOpenChange} open={open}>
      <ModalTrigger asChild>
        <button
          className="inline-flex h-8 items-center rounded-lg border border-border bg-card px-3 text-[12.5px] font-bold text-ink transition-colors hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-45"
          disabled={!hasSolution}
          aria-label={
            hasSolution
              ? t('answer.show')
              : `${t('answer.show')}: ${t('answer.missing')}`
          }
          title={!hasSolution ? t('answer.missing') : undefined}
          type="button"
        >
          {t('answer.show')}
        </button>
      </ModalTrigger>

      <ModalContent
        className="max-w-4xl"
        description={t('answer.description')}
        title={t('answer.title')}
      >
        <div className="min-h-0 flex-1 p-5 sm:p-6">
          {loading ? (
            <div className="grid h-[min(56vh,520px)] place-items-center rounded-xl border border-border bg-canvas text-[14px] font-semibold text-sub">
              {t('answer.loading')}
            </div>
          ) : failed || code === null ? (
            <div
              className="grid h-[min(56vh,520px)] place-items-center rounded-xl border border-danger/25 bg-danger/5 px-6 text-center text-[14px] font-semibold text-danger"
              role="alert"
            >
              {t('answer.failed')}
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-xl border border-[#34343f] bg-[#1e1e1e]">
              <button
                className="absolute right-3 top-3 z-10 inline-flex h-8 items-center gap-1.5 rounded-md border border-white/15 bg-[#2d2d2d] px-2.5 text-[12px] font-bold text-white transition-colors hover:bg-[#3a3a3a]"
                onClick={() => void copyAnswer()}
                type="button"
              >
                {copied ? (
                  <Check className="size-3.5" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                {copied ? t('answer.copied') : t('answer.copy')}
              </button>
              <MonacoEditor
                beforeMount={registerPaircodeTheme}
                height="min(56vh, 520px)"
                language="python"
                options={{
                  automaticLayout: true,
                  fontFamily: "'Fira Code', Consolas, monospace",
                  fontSize,
                  lineNumbers: 'on',
                  minimap: { enabled: false },
                  padding: { bottom: 16, top: 16 },
                  readOnly: true,
                  scrollBeyondLastLine: false,
                  tabSize: 4,
                  wordWrap: 'off',
                }}
                theme="paircode-dark"
                value={code}
              />
            </div>
          )}
          {copyFailed ? (
            <p
              className="mt-2 text-[13px] font-semibold text-danger"
              role="alert"
            >
              {t('answer.copy_failed')}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end border-t border-border px-5 py-4 sm:px-6">
          <button
            className="inline-flex h-10 items-center rounded-lg bg-ink px-5 text-[14px] font-bold text-canvas transition-opacity hover:opacity-85"
            onClick={() => handleOpenChange(false)}
            type="button"
          >
            {t('answer.close')}
          </button>
        </div>
      </ModalContent>
    </Modal>
  );
}
