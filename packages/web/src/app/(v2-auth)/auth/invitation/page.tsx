import { AuthCard } from '../_components/auth-card';
import { InvitationAcceptance } from './_components/invitation-acceptance';

export default function InvitationPage() {
  return (
    <AuthCard
      description="Your academy manager selected your initial role."
      title="Accept academy invitation"
    >
      <InvitationAcceptance />
    </AuthCard>
  );
}
