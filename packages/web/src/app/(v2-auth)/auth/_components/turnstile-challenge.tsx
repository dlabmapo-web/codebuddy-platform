'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type TurnstileWidgetId = string;

type TurnstileApi = {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      theme: 'auto';
      size: 'flexible';
      callback(token: string): void;
      'error-callback'(code?: string): void;
      'expired-callback'(): void;
      'timeout-callback'(): void;
    },
  ): TurnstileWidgetId;
  remove(widgetId: TurnstileWidgetId): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

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
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<TurnstileWidgetId | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  function renderWidget() {
    const api = window.turnstile;
    const container = containerRef.current;
    if (!api || !container || widgetIdRef.current) return;

    widgetIdRef.current = api.render(container, {
      sitekey: siteKey,
      action,
      theme: 'auto',
      size: 'flexible',
      callback: (token) => {
        setFailed(false);
        onTokenChange(token);
      },
      'error-callback': () => {
        setFailed(true);
        onTokenChange(null);
      },
      'expired-callback': () => onTokenChange(null),
      'timeout-callback': () => onTokenChange(null),
    });
  }

  useEffect(() => () => {
    const widgetId = widgetIdRef.current;
    if (widgetId && window.turnstile) {
      window.turnstile.remove(widgetId);
      widgetIdRef.current = undefined;
    }
  }, []);

  return (
    <div aria-label={t('captcha.label')}>
      <div className="min-h-[65px]" ref={containerRef} />
      <Script
        id="cloudflare-turnstile"
        onError={() => {
          setFailed(true);
          onTokenChange(null);
        }}
        onReady={renderWidget}
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
      />
      {failed ? (
        <p className="mt-2 text-[14px] text-danger" role="alert">
          {t('captcha.load_error')}
        </p>
      ) : null}
    </div>
  );
}
