
import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateStoreUser,
  createStoreSession,
  STORE_SESSION_COOKIE,
} from '@/lib/store-auth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const storeCode = String(body.storeCode || '').trim();
    const fullName = String(body.fullName || '').trim();
    const pin = String(body.pin || '');

    if (!storeCode || !fullName || !pin) {
      return NextResponse.json(
        { ok: false, error: 'Kode toko, nama, dan PIN wajib diisi' },
        { status: 400 }
      );
    }

    if (
      storeCode.length > 80 ||
      fullName.length > 120 ||
      pin.length > 32
    ) {
      return NextResponse.json(
        { ok: false, error: 'Data login tidak valid' },
        { status: 400 }
      );
    }

    const user = await authenticateStoreUser(
      storeCode,
      fullName,
      pin
    );

    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'Kode toko, nama, atau PIN salah' },
        { status: 401 }
      );
    }

    const session = await createStoreSession(user.userId);

    const response = NextResponse.json(
      {
        ok: true,
        message: 'Login berhasil',
        user: {
          storeId: user.storeId,
          storeName: user.storeName,
          storeCode: user.storeCode,
          userId: user.userId,
          fullName: user.fullName,
          role: user.role,
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );

    response.cookies.set(
      STORE_SESSION_COOKIE,
      session.token,
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 365 * 24 * 60 * 60,
      }
    );

    return response;
  } catch (error) {
    console.error(
      'Store login error:',
      error instanceof Error ? error.message : 'Unknown error'
    );

    return NextResponse.json(
      { ok: false, error: 'Login gagal. Silakan coba kembali.' },
      { status: 500 }
    );
  }
}

