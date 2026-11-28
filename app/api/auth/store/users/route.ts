
import { NextRequest, NextResponse } from 'next/server';
import {
  getStoreSession,
  STORE_SESSION_COOKIE,
  createPinHash,
} from '@/lib/store-auth';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(STORE_SESSION_COOKIE)?.value;
    const session = await getStoreSession(token);

    if (!session) {
      return NextResponse.json(
        { ok: false, error: 'Session tidak valid.' },
        { status: 401 }
      );
    }

    if (
      session.role !== 'spv' &&
      session.role !== 'assistant_spv'
    ) {
      return NextResponse.json(
        { ok: false, error: 'Anda tidak memiliki izin.' },
        { status: 403 }
      );
    }

    const { data, error } = await supabase
      .from('store_users')
      .select('id, full_name, role, is_active, created_at')
      .eq('store_id', session.storeId)
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      ok: true,
      users: data || [],
    });
  } catch (error) {
    console.error('GET STORE USERS ERROR:', error);

    return NextResponse.json(
      { ok: false, error: 'Gagal mengambil daftar pengguna.' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const token = request.cookies.get(STORE_SESSION_COOKIE)?.value;
    const session = await getStoreSession(token);

    if (!session) {
      return NextResponse.json(
        { ok: false, error: 'Session tidak valid.' },
        { status: 401 }
      );
    }

    if (
      session.role !== 'spv' &&
      session.role !== 'assistant_spv'
    ) {
      return NextResponse.json(
        { ok: false, error: 'Anda tidak memiliki izin.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const userId =
      typeof body.userId === 'string' ? body.userId.trim() : '';

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: 'ID Staff tidak ditemukan.' },
        { status: 400 }
      );
    }

    let changes: { pin_hash?: string; is_active?: boolean };
    let message = '';

    if (body.action === 'reset_pin') {
      const pin = typeof body.pin === 'string' ? body.pin.trim() : '';

      if (!/^\d{6}$/.test(pin)) {
        return NextResponse.json(
          { ok: false, error: 'PIN harus terdiri dari 6 angka.' },
          { status: 400 }
        );
      }

      changes = { pin_hash: createPinHash(pin) };
      message = 'PIN Staff berhasil diperbarui.';
    } else if (body.action === 'set_active') {
      if (typeof body.isActive !== 'boolean') {
        return NextResponse.json(
          { ok: false, error: 'Status akun tidak valid.' },
          { status: 400 }
        );
      }

      changes = { is_active: body.isActive };
      message = body.isActive
        ? 'Akun Staff berhasil diaktifkan.'
        : 'Akun Staff berhasil dinonaktifkan.';
    } else {
      return NextResponse.json(
        { ok: false, error: 'Aksi tidak dikenal.' },
        { status: 400 }
      );
    }

    // Hanya akun Staff di toko yang sedang login yang boleh diubah.
    const { data, error } = await supabase
      .from('store_users')
      .update(changes)
      .eq('id', userId)
      .eq('store_id', session.storeId)
      .eq('role', 'staff')
      .select('id, full_name, role, is_active')
      .maybeSingle();

    if (error) {
      console.error('UPDATE STAFF ERROR:', error);
      return NextResponse.json(
        { ok: false, error: 'Gagal memperbarui akun Staff.' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { ok: false, error: 'Akun Staff tidak ditemukan.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      message,
      user: data,
    });
  } catch (error) {
    console.error('UPDATE STAFF ERROR:', error);

    return NextResponse.json(
      { ok: false, error: 'Terjadi kesalahan saat memperbarui Staff.' },
      { status: 500 }
    );
  }
}

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
