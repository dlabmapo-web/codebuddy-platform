import { AuthCard } from '../_components/auth-card';
import { SignupForm } from './_components/signup-form';

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{
    invited?: string;
    academy?: string;
    error?: string;
  }>;
}) {
  const query = await searchParams;
  const socialError = query.error === 'academy-required'
    ? 'Choose your academy and try social signup again.'
    : query.error === 'oauth'
      ? 'Social signup could not be completed. Try again.'
      : undefined;
  return (
    <AuthCard
      description="One account works across every DLAB academy — with its own role in each."
      title="Create your account"
    >
      <SignupForm
        invitedAcademyId={query.invited === '1' ? query.academy : undefined}
        socialError={socialError}
      />
    </AuthCard>
  );
}
