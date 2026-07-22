import { AuthCard } from '../_components/auth-card';
import { LoginForm } from './_components/login-form';

export default function LoginPage() {
  return (
    <AuthCard
      description="Sign in to pick up where you left off. Your academy manager controls academy access and roles."
      title="Welcome back"
    >
      <LoginForm />
    </AuthCard>
  );
}
