
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
    const spreadsheetId = body.spreadsheetId;

    if (
      typeof spreadsheetId !== 'string' ||
      !/^[a-zA-Z0-9_-]{20,}$/.test(spreadsheetId)
    ) {
      return NextResponse.json(
        { ok: false, error: 'ID spreadsheet tidak valid' },
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

    const { data: account, error: accountError } = await supabase
      .from('google_accounts')
      .select('refresh_token_enc')
      .eq('google_sub', session.sub)
      .maybeSingle();

    if (accountError || !account?.refresh_token_enc) {
      return NextResponse.json(
        { ok: false, error: 'Akun Google belum terhubung' },
        { status: 401 }
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

    const accessToken = tokens.access_token;
    const requiredTab = 'PRICE_LABEL_SCAN';

    // 1. Periksa spreadsheet dan daftar tab
    const sheetResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=spreadsheetId,properties.title,sheets.properties`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      }
    );

    const sheetData = await sheetResponse.json();

    if (!sheetResponse.ok) {
      return NextResponse.json(
        { ok: false, error: 'Spreadsheet tidak dapat diakses akun ini' },
        { status: 403 }
      );
    }

    let tab = sheetData.sheets?.find(
      (sheet: { properties?: { title?: string; sheetId?: number } }) =>
        sheet.properties?.title === requiredTab
    );

    // 2. Jika tab belum ada, buat otomatis
    if (!tab) {
      const createTabResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: [
              {
                addSheet: {
                  properties: {
                    title: requiredTab,
                  },
                },
              },
            ],
          }),
          cache: 'no-store',
        }
      );

      const createTabData = await createTabResponse.json();

      if (!createTabResponse.ok) {
        throw new Error('Gagal membuat tab PRICE_LABEL_SCAN');
      }

      tab = {
        properties: {
          title: requiredTab,
          sheetId: createTabData.replies?.[0]?.addSheet?.properties?.sheetId,
        },
      };
    }

    // 3. Periksa kolom A sampai D agar data lama tidak tertimpa
    const checkRange = encodeURIComponent(`${requiredTab}!A:D`);

    const checkResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${checkRange}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      }
    );

    const checkData = await checkResponse.json();

    if (!checkResponse.ok) {
      throw new Error('Gagal memeriksa isi spreadsheet');
    }

    const hasData = (checkData.values || []).some(
      (row: unknown[]) =>
        row.some(
          (cell: unknown) =>
            cell !== '' && cell !== null && cell !== undefined
        )
    );

    if (hasData) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Tab PRICE_LABEL_SCAN sudah memiliki isi di kolom A-D. Data tidak diubah. Gunakan tab kosong untuk setup otomatis.',
        },
        { status: 409 }
      );
    }

    // 4. Buat header dan rumus PRINT
    const headerRange = encodeURIComponent(`${requiredTab}!A1:D1`);

    const setupResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${headerRange}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: [[
            'SHELF',
            'SKU',
            'SHELF,SKU',
            '={"PRINT";ARRAYFORMULA(IF(B2:B="";"";B2:B&","&1))}',
          ]],
        }),
        cache: 'no-store',
      }
    );

    if (!setupResponse.ok) {
      throw new Error('Gagal membuat header dan rumus PRINT');
    }

    // 5. Simpan spreadsheet untuk akun toko ini
    const { error: saveError } = await supabase
      .from('google_accounts')
      .update({
        spreadsheet_id: spreadsheetId,
        sheet_name: requiredTab,
        updated_at: new Date().toISOString(),
      })
      .eq('google_sub', session.sub);

    if (saveError) {
      throw new Error('Gagal menyimpan pilihan spreadsheet');
    }

    return NextResponse.json({
      ok: true,
      spreadsheetName: sheetData.properties?.title,
      sheetName: requiredTab,
      message: 'Spreadsheet berhasil disiapkan dengan header dan rumus PRINT',
    });
  } catch (error) {
    console.error(
      'Save spreadsheet error:',
      error instanceof Error ? error.message : 'Unknown error'
    );

    return NextResponse.json(
      { ok: false, error: 'Gagal menyiapkan spreadsheet' },
      { status: 500 }
    );
  }
}
