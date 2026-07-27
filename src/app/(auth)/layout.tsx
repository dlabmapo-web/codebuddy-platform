import ThemeToggle from '@/components/ThemeToggle';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ThemeToggle floating />
    </>
  );
}
