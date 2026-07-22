import { NextResponse } from 'next/server';

export interface ApiError {
  error: { code: string; message: string };
}

export function apiError(message: string, code: string, status: number): NextResponse<ApiError> {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function apiOk<T extends Record<string, unknown>>(data: T, status = 200): NextResponse<T> {
  return NextResponse.json(data, { status });
}
