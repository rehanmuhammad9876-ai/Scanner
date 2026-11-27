
import { NextRequest, NextResponse } from 'next/server';
import { createDecipheriv } from 'crypto';
import { getGoogleSession } from '@/lib/google-auth';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';

const SHEET_NAME = 'PRICE_LABEL_SCAN';

function decrypt(text: string, key: Buffer): string {
  const parts = text.split('.');

  if (parts.length !== 3) {
    throw new Error('Format token tidak valid. Silakan login ulang Google.');
  }

  const [ivText, tagText, encryptedText] = parts;

  const iv = Buffer.from(ivText, 'base64url');
  const tag = Buffer.from(tagText, 'base64url');
  const encrypted = Buffer.from(encryptedText, 'base64url');

  if (iv.length !== 12 || tag.length !== 16) {
    throw new Error('Token tidak valid. Silakan login ulang Google.');
  }

  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      iv
    );

    decipher.setAuthTag(tag);

    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new Error(
      'Refresh token tidak dapat dibuka. Silakan login ulang Google.'
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // 1. Periksa sesi Google
    const session = getGoogleSession(request);

    if (!session) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Silakan login Google terlebih dahulu',
        },
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
        {
          ok: false,
          error: 'ID spreadsheet tidak valid',
        },
        { status: 400 }
      );
    }

    // 2. Periksa konfigurasi
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

    // 3. Ambil refresh token terbaru dari Supabase
    const { data: account, error: accountError } = await supabase
      .from('google_accounts')
      .select('refresh_token_enc')
      .eq('google_sub', session.sub)
      .maybeSingle();

    if (accountError) {
      throw new Error('Gagal membaca akun Google dari database');
    }

    if (!account?.refresh_token_enc) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Akun Google belum terhubung. Silakan login ulang.',
        },
        { status: 401 }
      );
    }

    const refreshToken = decrypt(
      account.refresh_token_enc,
      key
    );

    // 4. Perbarui akses Google
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
      console.error('Google token error:', tokens.error);

      throw new Error(
        'Gagal memperbarui akses Google. Silakan login ulang.'
      );
    }

    const accessToken = tokens.access_token;

    // 5. Periksa spreadsheet
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
      console.error('Spreadsheet access error:', sheetData);

      return NextResponse.json(
        {
          ok: false,
          error: 'Spreadsheet tidak dapat diakses akun Google ini',
        },
        { status: 403 }
      );
    }

    // 6. Cari tab PRICE_LABEL_SCAN
    let tab = sheetData.sheets?.find(
      (sheet: {
        properties?: { title?: string; sheetId?: number };
      }) => sheet.properties?.title === SHEET_NAME
    );

    // 7. Jika belum ada, buat tab baru
    if (!tab) {
      const createResponse = await fetch(
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
                    title: SHEET_NAME,
                  },
                },
              },
            ],
          }),
          cache: 'no-store',
        }
      );

      const createData = await createResponse.json();

      if (!createResponse.ok) {
        console.error('Create tab error:', createData);

        throw new Error('Gagal membuat tab PRICE_LABEL_SCAN');
      }

      tab = {
        properties: {
          title: SHEET_NAME,
          sheetId:
            createData.replies?.[0]?.addSheet?.properties?.sheetId,
        },
      };
    }

    // 8. Periksa isi kolom A-D
    const checkRange = encodeURIComponent(
      `${SHEET_NAME}!A1:D`
    );

    const checkResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${checkRange}?valueRenderOption=FORMATTED_VALUE`,
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

    const values = checkData.values || [];

    const hasData = values.some(
      (row: unknown[]) =>
        row.some(
          (cell: unknown) =>
            cell !== '' &&
            cell !== null &&
            cell !== undefined
        )
    );

    // 9. Periksa header yang sudah ada
    const header = values[0] || [];

    const headerIsCorrect =
      header[0] === 'SHELF' &&
      header[1] === 'SKU' &&
      header[2] === 'E-BARCODE' &&
      header[3] === 'PRINT';

    if (hasData && !headerIsCorrect) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Tab PRICE_LABEL_SCAN memiliki data tetapi header belum sesuai. Data tidak diubah.',
        },
        { status: 409 }
      );
    }

    // 10. Jika tab kosong, buat header dan rumus PRINT
    if (!hasData) {
      const headerRange = encodeURIComponent(
        `${SHEET_NAME}!A1:D1`
      );

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
              'E-BARCODE',
              '={"PRINT";ARRAYFORMULA(IF(B2:B="";"";B2:B&","&1))}',
            ]],
          }),
          cache: 'no-store',
        }
      );

      const setupData = await setupResponse.json();

      if (!setupResponse.ok) {
        console.error('Setup header error:', setupData);

        throw new Error('Gagal membuat header dan rumus PRINT');
      }
    }

    // 11. Simpan Spreadsheet Aktif ke Supabase
    // Dilakukan juga jika tab sudah berisi data dan header benar.
    const { data: savedAccount, error: saveError } = await supabase
      .from('google_accounts')
      .update({
        spreadsheet_id: spreadsheetId,
        sheet_name: SHEET_NAME,
        updated_at: new Date().toISOString(),
      })
      .eq('google_sub', session.sub)
      .select('google_sub')
      .maybeSingle();

    if (saveError) {
      console.error('Save spreadsheet error:', saveError);

      throw new Error('Gagal menyimpan pilihan spreadsheet ke database');
    }

    if (!savedAccount) {
      throw new Error('Akun Google tidak ditemukan di database');
    }

    // 12. Berhasil
    return NextResponse.json({
      ok: true,
      spreadsheetId,
      spreadsheetName: sheetData.properties?.title,
      sheetName: SHEET_NAME,
      existingDataPreserved: hasData,
      message: hasData
        ? 'Spreadsheet berhasil dipilih. Data lama tetap aman.'
        : 'Spreadsheet berhasil disiapkan dengan header dan rumus PRINT.',
    });

  } catch (error) {
    console.error(
      'Save spreadsheet error:',
      error instanceof Error ? error.message : 'Unknown error'
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Gagal menyiapkan spreadsheet',
      },
      { status: 500 }
    );
  }
}
