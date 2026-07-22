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
