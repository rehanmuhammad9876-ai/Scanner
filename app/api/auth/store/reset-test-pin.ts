
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { supabase } from '@/lib/supabase';
import { hashPin } from '@/lib/store-auth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const resetKey = process.env.STORE_PIN_RESET_KEY;
    const providedKey = request.headers.get('x-reset-key') || '';

    if (!resetKey || !providedKey) {
      return NextResponse.json(
        { ok: false, error: 'Akses ditolak' },
        { status: 401 }
      );
    }

    const expected = Buffer.from(resetKey);
    const provided = Buffer.from(providedKey);

    if (
      expected.length !== provided.length ||
      !timingSafeEqual(expected, provided)
    ) {
      return NextResponse.json(
        { ok: false, error: 'Akses ditolak' },
        { status: 401 }
      );
    }

    const { data: store, error: storeError } = await supabase
      .from('stores')
      .select('id')
      .eq('store_code', 'GK4006')
      .eq('is_active', true)
      .maybeSingle();

    if (storeError || !store) {
      throw new Error('Toko uji tidak ditemukan');
    }

    const { data: user, error: userError } = await supabase
      .from('store_users')
      .select('id')
      .eq('store_id', store.id)
      .eq('full_name', 'Cihuyy')
      .eq('role', 'spv')
      .eq('is_active', true)
      .maybeSingle();

    if (userError || !user) {
      throw new Error('Pengguna uji tidak ditemukan');
    }

    const newHash = hashPin('123456');

    const { data: updated, error: updateError } = await supabase
      .from('store_users')
      .update({ pin_hash: newHash })
      .eq('id', user.id)
      .eq('store_id', store.id)
      .select('id')
      .single();

    if (updateError || !updated) {
      throw new Error('Gagal memperbarui PIN');
    }

    return NextResponse.json({
      ok: true,
      message: 'PIN akun uji berhasil diperbarui',
    });
  } catch (error) {
    console.error(
      'Reset test PIN error:',
      error instanceof Error ? error.message : 'Unknown error'
    );

    return NextResponse.json(
      { ok: false, error: 'Reset PIN gagal' },
      { status: 500 }
    );
  }
}
