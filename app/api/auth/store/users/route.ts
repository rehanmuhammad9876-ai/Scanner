
import { NextRequest, NextResponse } from 'next/server';
import {
  getStoreSession,
  STORE_SESSION_COOKIE,
  createPinHash,
} from '@/lib/store-auth';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    // Periksa session pengguna yang sedang login.
    const token = request.cookies.get(STORE_SESSION_COOKIE)?.value;
    const session = await getStoreSession(token);

    if (!session) {
      return NextResponse.json(
        { ok: false, error: 'Session tidak valid. Silakan login kembali.' },
        { status: 401 }
      );
    }

    // Hanya SPV dan Assistant SPV yang boleh mengelola akun.
    if (
      session.role !== 'spv' &&
      session.role !== 'assistant_spv'
    ) {
      return NextResponse.json(
        { ok: false, error: 'Anda tidak memiliki izin mengelola pengguna.' },
        { status: 403 }
      );
    }

    const body = await request.json();

    const fullName =
      typeof body.fullName === 'string' ? body.fullName.trim() : '';

    const pin =
      typeof body.pin === 'string' ? body.pin.trim() : '';

    if (!fullName) {
      return NextResponse.json(
        { ok: false, error: 'Nama staff wajib diisi.' },
        { status: 400 }
      );
    }

    if (!/^\d{6}$/.test(pin)) {
      return NextResponse.json(
        { ok: false, error: 'PIN harus terdiri dari 6 angka.' },
        { status: 400 }
      );
    }

    // Akun baru selalu menjadi Staff.
    // Store ID diambil dari session, bukan dari input pengguna.
    const { data, error } = await supabase
      .from('store_users')
      .insert({
        store_id: session.storeId,
        full_name: fullName,
        role: 'staff',
        pin_hash: createPinHash(pin),
        is_active: true,
      })
      .select('id, full_name, role, is_active')
      .single();

    if (error?.code === '23505') {
      return NextResponse.json(
        { ok: false, error: 'Nama staff sudah terdaftar di toko ini.' },
        { status: 409 }
      );
    }

    if (error || !data) {
      console.error('CREATE STAFF ERROR:', error);

      return NextResponse.json(
        { ok: false, error: 'Gagal menambahkan akun staff.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: 'Akun staff berhasil ditambahkan.',
      user: data,
    });
  } catch (error) {
    console.error('CREATE STAFF ERROR:', error);

    return NextResponse.json(
      { ok: false, error: 'Terjadi kesalahan saat menambahkan staff.' },
      { status: 500 }
    );
  }
}
