/** Brand marks for the social sign-in row. Each renders at the given box size. */

export function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M23.06 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h6.2a5.3 5.3 0 0 1-2.3 3.48v2.89h3.72c2.18-2 3.44-4.96 3.44-8.38Z" fill="#4285F4" />
      <path d="M12 23.5c3.1 0 5.71-1.03 7.62-2.79l-3.72-2.89c-1.03.69-2.35 1.1-3.9 1.1-3 0-5.54-2.03-6.45-4.75H1.7v2.98A11.5 11.5 0 0 0 12 23.5Z" fill="#34A853" />
      <path d="M5.55 14.17a6.9 6.9 0 0 1 0-4.34V6.85H1.7a11.5 11.5 0 0 0 0 10.3l3.85-2.98Z" fill="#FBBC05" />
      <path d="M12 4.75c1.69 0 3.2.58 4.4 1.72l3.3-3.3A11.5 11.5 0 0 0 1.7 6.85l3.85 2.98C6.46 6.78 9 4.75 12 4.75Z" fill="#EA4335" />
    </svg>
  );
}

export function KakaoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 3.5C6.9 3.5 2.75 6.74 2.75 10.73c0 2.55 1.7 4.79 4.27 6.06-.14.5-.9 3.12-.93 3.33 0 0-.02.15.08.21.1.06.22.01.22.01.28-.04 3.26-2.14 3.78-2.5.6.09 1.22.13 1.83.13 5.1 0 9.25-3.24 9.25-7.25S17.1 3.5 12 3.5Z"
        fill="#181600"
      />
    </svg>
  );
}

export function NaverIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 4h5.02l5.34 7.6V4H20v16h-5.02L9.64 12.4V20H4V4Z" fill="#03C75A" />
    </svg>
  );
}

/**
 * The boxed D·LAB mark, traced from the brand file DLAB supplied (QA-01).
 *
 * `currentColor` rather than black, so the mark follows the button's text
 * colour and stays legible on the dark theme without a second asset.
 */
export function DlabLogo({ className }: { className?: string }) {
  return (
    <svg aria-hidden className={className} fill="currentColor" viewBox="29 38 575 273" xmlns="http://www.w3.org/2000/svg">
      <path d="M29 38H239V85H604V311H164V264H29ZM48 57V244H183V290H584V104H219V57ZM91 99H130A51 51 0 0 1 130 201H91ZM113 123.5V176.5H129.5A26.5 26.5 0 0 0 129.5 123.5ZM274 145H297V226H335V248H274ZM351.1 248L402 140.5L453.9 248H428.8L402.5 188.7L375.2 248ZM472 146H514C530 146 541 156 541 170.5C541 183 535 191 526 195.5C537 199 544 208 544 221.5C544 237 532 248 516 248H472ZM495 167V186H507.5A9.5 9.5 0 0 0 507.5 167ZM495 206V226H509A10 10 0 0 0 509 206Z" fillRule="evenodd" />
      <circle cx="219.5" cy="188" r="13.75" />
    </svg>
  );
}
