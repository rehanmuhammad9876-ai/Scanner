import { NextRequest, NextResponse } from 'next/server';
import { getGoogleSession } from '@/lib/google-auth';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const session = getGoogleSession(request);

    if (!session) {
      return NextResponse.json(
        { ok: false, connected: false },
        { status: 401 }
      );
    }

    const { data, error } = await supabase
      .from('google_accounts')
      .select('email, spreadsheet_id, sheet_name')
      .eq('google_sub', session.sub)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json(
        { ok: false, connected: false },
        { status: 401 }
      );
    }

    return NextResponse.json({
      ok: true,
      connected: true,
      email: data.email,
      spreadsheetSelected: Boolean(data.spreadsheet_id),
      spreadsheetName: data.sheet_name,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Gagal memeriksa koneksi Google' },
      { status: 500 }
    );
  }
}
