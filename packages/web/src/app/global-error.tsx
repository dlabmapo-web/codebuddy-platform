'use client';

/**
 * The root layout itself failed.
 *
 * This replaces the whole document, which means nothing above it exists — no
 * theme class, no i18next instance, no guarantee the stylesheet loaded. So it
 * carries its own colours inline and its own copy in both languages rather
 * than calling `t`, which would throw a second time inside the handler for the
 * first. Korean leads because the app's default locale is Korean.
 *
 * Every narrower failure is caught by a boundary that can do better than this.
 * Reaching this one means the shell could not be built at all, so the only
 * honest offer is to try building it again.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ko">
      <body
        style={{
          alignItems: 'center',
          background: '#F4F7FC',
          color: '#16181D',
          display: 'flex',
          fontFamily: 'Pretendard, system-ui, sans-serif',
          justifyContent: 'center',
          margin: 0,
          minHeight: '100svh',
          padding: '20px',
        }}
      >
        <div style={{ maxWidth: '28rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>
            페이지를 불러오지 못했습니다
          </h1>
          <p style={{ color: '#5A6270', lineHeight: 1.65, marginTop: '10px' }}>
            잠시 후 다시 시도하세요. 계속 발생하면 관리자에게 알려주세요.
          </p>
          <p style={{ color: '#5A6270', lineHeight: 1.65, marginTop: '4px' }}>
            This page could not be loaded. Try again in a moment.
          </p>
          <button
            onClick={reset}
            style={{
              background: '#E8461C',
              border: 0,
              borderRadius: '8px',
              color: '#FFFFFF',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 700,
              marginTop: '24px',
              padding: '10px 18px',
            }}
            type="button"
          >
            다시 시도 · Try again
          </button>
        </div>
      </body>
    </html>
  );
}
