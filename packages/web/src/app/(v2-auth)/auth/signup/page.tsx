import { AuthCard } from '../_components/auth-card';
import { SignupForm } from './_components/signup-form';

export default function SignupPage() {
  return (
    <AuthCard
      description="One account works across every DLAB academy — with its own role in each."
      title="Create your account"
    >
      <SignupForm />
    </AuthCard>
  );
}
