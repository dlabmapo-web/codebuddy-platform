'use client';

import Script from 'next/script';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/lib/theme/theme-provider';

type TurnstileWidgetId = string;

type TurnstileApi = {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      theme: 'light' | 'dark';
      size: 'flexible';
      callback(token: string): void;
      'error-callback'(code?: string): void;
      'expired-callback'(): void;
      'timeout-callback'(): void;
    },
  ): TurnstileWidgetId;
  remove(widgetId: TurnstileWidgetId): void;
  /** Re-runs the challenge on a widget that is already on the page. */
  reset(widgetId: TurnstileWidgetId): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * How long the widget may take to *appear* before the page admits it has not.
 *
 * The failure this guards is silence, not error. An ad blocker, a school
 * proxy, or a filtered network can leave the request to Cloudflare hanging:
 * `onReady` never fires, `onError` never fires, no widget renders, and the
 * submit button stays disabled with an empty gap above it and no way in.
 *
 * It measures the widget arriving, never the challenge being solved. A managed
 * widget shows a checkbox and waits for a person, who owes it no particular
 * promptness — timing that would call every unhurried reader a network fault
 * and tell them, under a working checkbox, that it had failed to load.
 */
const loadTimeoutMs = 10_000;

type ChallengeStatus =
  /** No widget on the page yet; the watchdog is running. */
  | 'loading'
  /** On screen and waiting — for Cloudflare, or for a person to tick a box. */
  | 'rendered'
  /** A token has arrived. */
  | 'ready'
  | 'failed';

/** A fresh, single-use Turnstile challenge for one authentication attempt. */
export function TurnstileChallenge({
  action,
  siteKey,
  onTokenChange,
}: {
  action: 'login' | 'signup' | 'password_recovery';
  siteKey: string;
  onTokenChange(token: string | null): void;
}) {
  const { t } = useTranslation('auth');
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<TurnstileWidgetId | undefined>(undefined);
  const [status, setStatus] = useState<ChallengeStatus>('loading');
  const [failureCode, setFailureCode] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const fail = useCallback(
    (code: string) => {
      console.error('[turnstile] challenge unavailable', { action, code });
      setFailureCode(code);
      setStatus('failed');
      onTokenChange(null);
    },
    [action, onTokenChange],
  );

  const renderWidget = useCallback(() => {
    const api = window.turnstile;
    const container = containerRef.current;
    if (!api || !container || widgetIdRef.current) return;

    const widgetId = api.render(container, {
      sitekey: siteKey,
      action,
      // The reader's own choice, not the operating system's. This product has
      // no `system` theme — the toggle in the header is the whole answer — so
      // Turnstile's `auto` would have followed something the rest of the page
      // ignores, and put a light widget on a dark card.
      //
      // Read once, at render. Re-rendering to follow a mid-form toggle would
      // discard a challenge the person has already solved, which is a worse
      // trade than a widget that keeps the theme it opened in.
      theme,
      size: 'flexible',
      callback: (token) => {
        setStatus('ready');
        setFailureCode(null);
        onTokenChange(token);
      },
      // The code is kept rather than dropped. A deployment whose site key is
      // wrong answers 110100 and one serving an unlisted domain answers
      // 110200; both used to arrive as the same sentence with nothing to look
      // up, which is the state a broken key would sit in indefinitely.
      'error-callback': (code) => fail(code ?? 'unknown'),
      // Neither of these is a failure. The widget is on the page and refreshes
      // itself, so only the token is dropped — the button waits for the
      // replacement instead of accusing the network of being down.
      'expired-callback': () => onTokenChange(null),
      'timeout-callback': () => onTokenChange(null),
    });
    widgetIdRef.current = widgetId;
    // The widget exists, so the thing the watchdog was waiting for happened.
    // Whether it now solves itself or waits for a click is not its business.
    setStatus((current) => (current === 'loading' ? 'rendered' : current));
  }, [action, fail, onTokenChange, siteKey, theme]);

  // Re-armed on every attempt, so a retry that also goes nowhere is reported
  // the same way the first one was.
  useEffect(() => {
    if (status !== 'loading') return;
    const timer = setTimeout(() => fail('load_timeout'), loadTimeoutMs);
    return () => clearTimeout(timer);
  }, [attempt, fail, status]);

  useEffect(() => () => {
    const widgetId = widgetIdRef.current;
    if (widgetId && window.turnstile) {
      window.turnstile.remove(widgetId);
      widgetIdRef.current = undefined;
    }
  }, []);

  /**
   * The way out of a failed challenge, without reloading the page.
   *
   * Two different repairs behind one button. A widget that rendered and then
   * errored is reset in place; one that never rendered at all means the script
   * never arrived, so the render is attempted from the top. Losing a page of
   * typed credentials to an F5 was the only previous cure.
   */
  function retry() {
    setFailureCode(null);
    setStatus('loading');
    setAttempt((current) => current + 1);
    onTokenChange(null);

    const api = window.turnstile;
    const widgetId = widgetIdRef.current;
    if (api && widgetId) {
      try {
        api.reset(widgetId);
        // Still on the page, so the watchdog has nothing left to wait for —
        // re-arming it here would fail a widget that is merely waiting for a
        // click, which is the whole defect this retry exists to recover from.
        setStatus('rendered');
        return;
      } catch {
        // A widget id the script no longer recognises. Drop it and rebuild.
      }
      try {
        api.remove(widgetId);
      } catch {
        // Already gone, which is the state this wanted anyway.
      }
      widgetIdRef.current = undefined;
    }
    renderWidget();
  }

  return (
    <div aria-label={t('captcha.label')} role="group">
      <div className="min-h-[65px]" ref={containerRef} />
      <Script
        id="cloudflare-turnstile"
        onError={() => fail('script_blocked')}
        onReady={renderWidget}
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
      />
      {status === 'failed' ? (
        <div className="mt-2 space-y-2">
          <p className="text-[14px] leading-6 text-danger" role="alert">
            {t('captcha.load_error')}
            {failureCode ? (
              // Shown, not only logged. A person who cannot sign in reaches
              // their manager, not this console, and a code in the screenshot
              // is the difference between a guess and a lookup.
              <span className="ml-1.5 font-mono text-[12px] text-sub">
                ({failureCode})
              </span>
            ) : null}
          </p>
          <button
            className="rounded-lg border border-border px-3 py-1.5 text-[14px] font-semibold text-sub transition-colors hover:text-ink"
            onClick={retry}
            // Inside a form: without this it would submit one instead of
            // repairing the check that is blocking the submission.
            type="button"
          >
            {t('captcha.retry')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
