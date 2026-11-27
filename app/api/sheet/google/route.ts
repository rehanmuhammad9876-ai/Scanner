
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

  const decipher = createDecipheriv(
    'aes-256-gcm',
    key, 
    Buffer.from(ivText, 'base64url'),
  );

  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export async function POST(request: NextRequest) {
  try {
    const session = getGoogleSession(request);

    if (!session) {
      return NextResponse.json(
        { ok: false, error: 'Silakan login Google terlebih dahulu' },
        { status: 401 }
      );
    }

    const body = await request.json();

    const shelf = String(body.shelf || '').trim();
    const barcode = String(body.barcode || body.sku || '').trim();

    if (!shelf || !barcode) {
      return NextResponse.json(
        { ok: false, error: 'Shelf atau barcode kosong' },
        { status: 400 }
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

    const { data: account, error } = await supabase
      .from('google_accounts')
      .select('refresh_token_enc, spreadsheet_id, sheet_name')
      .eq('google_sub', session.sub)
      .maybeSingle();

    if (error || !account?.refresh_token_enc) {
      return NextResponse.json(
        { ok: false, error: 'Akun Google belum terhubung' },
        { status: 401 }
      );
    }

    if (!account.spreadsheet_id || !account.sheet_name) {
      return NextResponse.json(
        { ok: false, error: 'Pilih spreadsheet toko terlebih dahulu' },
        { status: 400 }
      );
    }

    const refreshToken = decrypt(account.refresh_token_enc, key);

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

    const range = encodeURIComponent(`${account.sheet_name}!A:C`);

    const appendResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(account.spreadsheet_id)}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: [[shelf, barcode, `${shelf},${barcode}`]],
        }),
        cache: 'no-store',
      }
    );

    const appendResult = await appendResponse.json();

    if (!appendResponse.ok) {
      console.error('Google Sheets append error:', appendResult);

      return NextResponse.json(
        { ok: false, error: 'Gagal menulis ke Google Sheet toko' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: 'Data berhasil dikirim ke Google Sheet toko',
    });
  } catch (error) {
    console.error(
      'Google Sheets scan error:',
      error instanceof Error ? error.message : 'Unknown error'
    );

    return NextResponse.json(
      { ok: false, error: 'Gagal mengirim data ke Google Sheet' },
      { status: 500 }
    );
  }
}
