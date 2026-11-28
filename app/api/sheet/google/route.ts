import { NextRequest, NextResponse } from 'next/server';
import { createDecipheriv } from 'crypto';
import {
  getStoreSession,
  STORE_SESSION_COOKIE,
} from '@/lib/store-auth';
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
    const storeToken = request.cookies.get(STORE_SESSION_COOKIE)?.value;
const session = await getStoreSession(storeToken);

if (!session) {
  return NextResponse.json(
    { ok: false, error: 'Sesi toko tidak valid. Silakan login kembali.' },
    { status: 401 }
  );
}

    const body = await request.json();

    const shelf = String(body.shelf || '').trim();
    const barcode = String(body.barcode || body.sku || '').trim();
const scanId = String(body.id || '').trim();

if (!scanId) {
  return NextResponse.json(
    { ok: false, error: 'ID scan wajib diisi' },
    { status: 400 }
  );
}
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
  .eq('store_id', session.storeId)
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
const idRange = encodeURIComponent(`${account.sheet_name}!F:F`);

const idResponse = await fetch(
  `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(account.spreadsheet_id)}/values/${idRange}`,
  {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
    },
    cache: 'no-store',
  }
);

if (!idResponse.ok) {
  throw new Error('Gagal memeriksa ID scan di Google Sheet');
}

const idResult = await idResponse.json();
const idValues = idResult.values || [];

const existingIndex = idValues.findIndex(
  (row: string[]) => row[0] === scanId
);

const existingRow = existingIndex >= 0
  ? existingIndex + 1
  : null;
    const range = encodeURIComponent(`${account.sheet_name}!A:C`);

    
let rowNumber: number;

if (existingRow !== null) {
  // Scan ini sudah pernah dikirim: gunakan baris yang sama.
  rowNumber = existingRow;
} else {
  // Scan baru: tambahkan data ke A-C.
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
    throw new Error('Gagal menulis data ke Google Sheet');
  }

  const updatedRange = appendResult.updates?.updatedRange;
  const rowMatch = updatedRange?.match(/!A(\d+):C\d+$/);

  if (!rowMatch) {
    throw new Error('Nomor baris hasil scan tidak ditemukan');
  }

  rowNumber = Number(rowMatch[1]);
}

// 1. Simpan ID scan lebih dahulu ke kolom F
const idWriteRange = encodeURIComponent(
  `${account.sheet_name}!F${rowNumber}`
);

const idWriteResponse = await fetch(
  `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(account.spreadsheet_id)}/values/${idWriteRange}?valueInputOption=RAW`,
  {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      values: [[scanId]],
    }),
  }
);

if (!idWriteResponse.ok) {
  throw new Error('Gagal menyimpan ID scan');
}

// 2. Setelah ID tersimpan, tulis nama staf ke kolom E
const staffRange = encodeURIComponent(
  `${account.sheet_name}!E${rowNumber}`
);

const staffResponse = await fetch(
  `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(account.spreadsheet_id)}/values/${staffRange}?valueInputOption=RAW`,
  {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      values: [[session.fullName]],
    }),
  }
);

if (!staffResponse.ok) {
  throw new Error('Gagal menyimpan nama staf');
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
