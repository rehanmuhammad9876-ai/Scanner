
import { NextRequest, NextResponse } from 'next/server';
import {
  getStoreSession,
  STORE_SESSION_COOKIE,
} from '@/lib/store-auth';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(
      STORE_SESSION_COOKIE
    )?.value;

    const session = await getStoreSession(token);

    if (!session) {
      const response = NextResponse.json(
        { ok: false, authenticated: false },
        { status: 401 }
      );

      response.cookies.set(STORE_SESSION_COOKIE, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
      });

      return response;
    }

    return NextResponse.json(
      {
        ok: true,
        authenticated: true,
        user: {
          userId: session.userId,
          storeId: session.storeId,
          storeName: session.storeName,
          storeCode: session.storeCode,
          fullName: session.fullName,
          role: session.role,
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error(
      'Store session error:',
      error instanceof Error ? error.message : 'Unknown error'
    );

    return NextResponse.json(
      { ok: false, authenticated: false },
      { status: 500 }
    );
  }
}
