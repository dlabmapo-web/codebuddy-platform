import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { publicConfig } from '@/lib/config';

export const dlabEnabled = () => process.env.DLAB_SSO_ENABLED === 'true';
export const dlabCookieName = () => process.env.NODE_ENV === 'production' ? '__Host-cove-dlab-sso' : 'cove-dlab-sso-dev';
export function dlabCookie(value: string) {
  return { name: dlabCookieName(), value, httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: 300 };
}
export function parseAttempt(value?: string): { binding: string; state: string } | null {
  if (!value || !/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(value)) return null;
  const [binding, state] = value.split('.');
  return { binding: binding!, state: state! };
}
export const newBinding = () => randomBytes(32).toString('hex');
export function authResponse(destination: string, status: 302 | 303 = 302) {
  const response = NextResponse.redirect(new URL(destination, publicConfig.siteUrl), status);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
export async function dlabFailure() {
  const response = authResponse('/sso/error');
  response.cookies.set({ ...dlabCookie(''), maxAge: 0 });
  return response;
}
export async function dlabPost<T>(action: 'transactions' | 'complete' | 'activate', body: object, token?: string): Promise<T> {
  const secret = process.env.BFF_SHARED_SECRET;
  if (!dlabEnabled() || !secret) throw new Error('DLAB SSO unavailable');
  const response = await fetch(new URL(`/api/internal/dlab-sso/${action}`, publicConfig.apiUrl), {
    method: 'POST', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(25_000),
    headers: { 'Content-Type': 'application/json', 'X-Cove-Bff-Secret': secret, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error('DLAB SSO request failed');
  return response.json() as Promise<T>;
}
export async function clearDlabContext() {
  const jar = await cookies();
  for (const name of ['cove_view_role', 'cove_invitation', 'cove_oauth_intent']) jar.delete(name);
}
