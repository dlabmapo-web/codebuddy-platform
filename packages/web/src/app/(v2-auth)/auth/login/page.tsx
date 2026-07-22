import { AuthCard } from '../_components/auth-card';
import { LoginForm } from './_components/login-form';

export default function LoginPage() {
  return (
    <AuthCard title="Sign in" description="Use your Cove account. Your academy manager controls academy access and roles.">
      <LoginForm />
    </AuthCard>
  );
}
