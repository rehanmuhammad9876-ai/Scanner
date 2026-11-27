
import { NextRequest, NextResponse } from 'next/server';
import {
  createCipheriv,
  randomBytes,
  timingSafeEqual,
} from 'crypto';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';

const REDIRECT_URI =
  'https://scanner-chi-eosin.vercel.app/api/auth/google/callback';

function encrypt(text: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([
    cipher.update(text, 'utf8'),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return [
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;

  try {
    const code = request.nextUrl.searchParams.get('code');
    const state = request.nextUrl.searchParams.get('state');
    const savedState = request.cookies.get('google_oauth_state')?.value;

    if (!code || !state || !savedState) {
      return NextResponse.redirect(
        new URL('/?google=invalid', origin)
      );
    }

    const stateBuffer = Buffer.from(state);
    const savedBuffer = Buffer.from(savedState);

    if (
      stateBuffer.length !== savedBuffer.length ||
      !timingSafeEqual(stateBuffer, savedBuffer)
    ) {
      return NextResponse.redirect(
        new URL('/?google=invalid', origin)
      );
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const encryptionKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;

    if (!clientId || !clientSecret || !encryptionKey) {
      throw new Error('Konfigurasi Google belum lengkap');
    }

    const key = Buffer.from(encryptionKey, 'hex');

    if (key.length !== 32) {
      throw new Error('Kunci enkripsi harus 32 byte');
    }

    const tokenResponse = await fetch(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code',
        }),
        cache: 'no-store',
      }
    );

    const tokens = await tokenResponse.json();

    if (!tokenResponse.ok || !tokens.access_token) {
      throw new Error('Pertukaran token Google gagal');
    }

    const userResponse = await fetch(
      'https://openidconnect.googleapis.com/v1/userinfo',
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
        cache: 'no-store',
      }
    );

    const user = await userResponse.json();

    if (!userResponse.ok || !user.sub || !user.email_verified) {
      throw new Error('Identitas Google tidak valid');
    }

    const { data: existing, error: lookupError } = await supabase
      .from('google_accounts')
      .select('refresh_token_enc')
      .eq('google_sub', user.sub)
      .maybeSingle();

    if (lookupError) {
      throw new Error('Gagal memeriksa akun Google');
    }

    const refreshToken = tokens.refresh_token
      ? encrypt(tokens.refresh_token, key)
      : existing?.refresh_token_enc;

    if (!refreshToken) {
      throw new Error('Refresh token Google tidak tersedia. Silakan login ulang.');
    }

    const { error: saveError } = await supabase
      .from('google_accounts')
      .upsert(
        {
          google_sub: user.sub,
          email: user.email,
          refresh_token_enc: refreshToken,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'google_sub' }
      );

    if (saveError) {
      throw new Error('Gagal menyimpan akun Google');
    }

    const session = encrypt(
      JSON.stringify({
        sub: user.sub,
        email: user.email,
        exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
      }),
      key
    );

    const response = NextResponse.redirect(
      new URL('/?google=connected', origin)
    );

    response.cookies.delete('google_oauth_state');

    response.cookies.set('pls_google_session', session, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return response;

  } catch (error) {
    console.error(
      'Google OAuth callback error:',
      error instanceof Error ? error.message : 'Unknown error'
    );

    const response = NextResponse.redirect(
      new URL('/?google=error', origin)
    );

    response.cookies.delete('google_oauth_state');

    return response;
  }
}

