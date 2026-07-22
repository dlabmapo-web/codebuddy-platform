import { AuthCard } from '../_components/auth-card';
import { SignupForm } from './_components/signup-form';

export default function SignupPage() {
  return (
    <AuthCard title="Create your Cove account" description="One account can belong to multiple academies with a different role in each.">
      <SignupForm />
    </AuthCard>
  );
}
