import { SignJWT, jwtVerify } from 'jose';
import type { UserRole } from '@/lib/types/db';

export interface JwtPayload {
  sub: string;
  role: UserRole;
  name: string;
}

const secret = () => new TextEncoder().encode(process.env.JWT_SECRET!);

const EXPIRES_IN = '7d';

export async function signToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ role: payload.role, name: payload.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(EXPIRES_IN)
    .sign(secret());
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      sub: payload.sub as string,
      role: payload.role as UserRole,
      name: payload.name as string,
    };
  } catch {
    return null;
  }
}
