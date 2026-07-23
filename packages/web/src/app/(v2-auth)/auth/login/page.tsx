import { AuthCard } from '../_components/auth-card';
import { LoginForm } from './_components/login-form';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const query = await searchParams;
  const initialError = query.error === 'identity-conflict'
    ? 'This email already has a Cove account. Sign in with its existing method.'
    : query.error
      ? 'Sign in could not be completed. Try again.'
      : undefined;
  return (
    <AuthCard
      description="Sign in to pick up where you left off. Your academy manager controls academy access and roles."
      title="Welcome back"
    >
      <LoginForm initialError={initialError} />
    </AuthCard>
  );
}
