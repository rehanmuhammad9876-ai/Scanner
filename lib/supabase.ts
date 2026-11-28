
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;
console.log(
  'SUPABASE CONFIG:',
  supabaseUrl ? 'URL ADA' : 'URL KOSONG',
  supabaseKey
    ? `KEY ADA (${supabaseKey.startsWith('sb_secret_') ? 'SECRET' : 'BUKAN FORMAT SECRET BARU'})`
    : 'KEY KOSONG'
);
if (!supabaseUrl || !supabaseKey) {
  throw new Error('Konfigurasi Supabase belum lengkap');
}

export const supabase = createClient(
  supabaseUrl,
  supabaseKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);
