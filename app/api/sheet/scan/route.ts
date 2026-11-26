
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.shelf || !body.barcode) {
      return Response.json(
        { ok: false, error: 'Shelf dan barcode wajib diisi' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('scan_records')
      .insert({
        alamat: body.shelf,
        sku: body.barcode,
        e_barcode: body.format || null,
        print: null,
        created_at: body.timestamp || new Date().toISOString(),
      });

    if (error) {
      throw error;
    }

    return Response.json({
      ok: true,
      message: 'Data berhasil disimpan ke Supabase',
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error
          ? error.message
          : 'Gagal menyimpan data Supabase',
      },
      { status: 500 }
    );
  }
}
