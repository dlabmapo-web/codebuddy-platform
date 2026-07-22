import { AuthCard } from '../_components/auth-card';
import { AccountBootstrap } from './_components/account-bootstrap';

export default function WelcomePage() {
  return (
    <AuthCard
      description="Your account is ready. Your identity stays separate from the roles each academy gives you."
      title="You're all set"
    >
      <AccountBootstrap />
    </AuthCard>
  );
}
