import { redirect } from 'next/navigation';

import { authDestination } from '@/lib/academy-access-state';
import { createServerORPCClient } from '@/lib/orpc-server';
import { routes } from '@/lib/routes';

export default async function Home() {
  const account = await createServerORPCClient().auth.me({}).catch(() => null);
  redirect(account ? authDestination(account) : routes.login);
}
