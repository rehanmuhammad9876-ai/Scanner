
import { NextRequest, NextResponse } from 'next/server';
import {
  revokeStoreSession,
  STORE_SESSION_COOKIE,
} from '@/lib/store-auth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(
      STORE_SESSION_COOKIE
    )?.value;

    if (token) {
      await revokeStoreSession(token);
    }

    const response = NextResponse.json({
      ok: true,
      message: 'Berhasil keluar dari akun',
    });

    response.cookies.set(STORE_SESSION_COOKIE, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });

    return response;
  } catch (error) {
    console.error(
      'Store logout error:',
      error instanceof Error ? error.message : 'Unknown error'
    );

    return NextResponse.json(
      { ok: false, error: 'Gagal keluar dari akun' },
      { status: 500 }
    );
  }
}
