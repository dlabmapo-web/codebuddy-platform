import { AuthCard } from '../_components/auth-card';
import { AccountBootstrap } from './_components/account-bootstrap';

export default function WelcomePage() {
  return <AuthCard title="Welcome to Cove Studio" description="Your identity is separate from academy roles."><AccountBootstrap /></AuthCard>;
}
