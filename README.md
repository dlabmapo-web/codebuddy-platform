This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Authoritative code judging

Official Python submissions are graded through managed Judge0. The browser
Pyodide worker is used only for the interactive **Run** action.

Before enabling **Submit**:

1. Run `supabase/migrations/20260727_authoritative_judging.sql` in the Supabase
   SQL Editor.
2. Copy the Judge0 values from `.env.example` into local development and the
   Netlify environment-variable settings.
3. Set `JUDGE_CALLBACK_BASE_URL` to the public HTTPS origin that Judge0 can
   reach, without a trailing slash.
4. Use a Judge0 Python language ID supported by the selected provider instance
   (`71` is the common Judge0 CE Python 3 ID).

Judge0 credentials must remain server-only and must never use a
`NEXT_PUBLIC_` prefix.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
