
import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';

export const runtime = 'nodejs';

const REDIRECT_URI =
  'https://scanner-chi-eosin.vercel.app/api/auth/google/callback';

export async function GET() {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;

    if (!clientId) {
      return NextResponse.json(
        { ok: false, error: 'Google Client ID belum dikonfigurasi' },
        { status: 500 }
      );
    }

    const state = randomBytes(32).toString('hex');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: [
        'openid',
        'email',
        'profile',
        'https://www.googleapis.com/auth/drive.file',
      ].join(' '),
      access_type: 'offline',
      prompt: 'select_account consent',
      include_granted_scopes: 'true',
      state,
    });

    const response = NextResponse.redirect(
      `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
    );

    response.cookies.set('google_oauth_state', state, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 600,
    });

    return response;
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Gagal memulai login Google' },
      { status: 500 }
    );
  }
}

