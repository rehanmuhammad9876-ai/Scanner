import { NextRequest, NextResponse } from 'next/server';
import { createDecipheriv } from 'crypto';
import { getGoogleSession } from '@/lib/google-auth';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';

function decrypt(text: string, key: Buffer): string {
  const parts = text.split('.');

  if (parts.length !== 3) {
    throw new Error('Format token tidak valid');
  }

  const [ivText, tagText, encryptedText] = parts;

  const iv = Buffer.from(ivText, 'base64url');
  const tag = Buffer.from(tagText, 'base64url');
  const encrypted = Buffer.from(encryptedText, 'base64url');

  if (iv.length !== 12 || tag.length !== 16) {
    throw new Error('Token tidak valid');
  }

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString('utf8');
}

export async function GET(request: NextRequest) {
  try {
    const session = getGoogleSession(request);

    if (!session) {
      return NextResponse.json(
        { ok: false, error: 'Silakan login Google terlebih dahulu' },
        { status: 401 }
      );
    }

    const encryptionKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!encryptionKey || !clientId || !clientSecret) {
      throw new Error('Konfigurasi Google belum lengkap');
    }

    const key = Buffer.from(encryptionKey, 'hex');

    if (key.length !== 32) {
      throw new Error('Kunci enkripsi tidak valid');
    }

    const { data, error } = await supabase
      .from('google_accounts')
      .select('refresh_token_enc')
      .eq('google_sub', session.sub)
      .maybeSingle();

    if (error || !data?.refresh_token_enc) {
      return NextResponse.json(
        { ok: false, error: 'Akun Google belum terhubung' },
        { status: 401 }
      );
    }

    const refreshToken = decrypt(data.refresh_token_enc, key);

    const tokenResponse = await fetch(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
        cache: 'no-store',
      }
    );

    const tokens = await tokenResponse.json();

    if (!tokenResponse.ok || !tokens.access_token) {
      throw new Error('Gagal memperbarui akses Google');
    }

    return NextResponse.json(
      {
        ok: true,
        accessToken: tokens.access_token,
        expiresIn: tokens.expires_in,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error(
      'Google access token error:',
      error instanceof Error ? error.message : 'Unknown error'
    );

    return NextResponse.json(
      { ok: false, error: 'Gagal mendapatkan akses Google' },
      { status: 500 }
    );
  }
}
