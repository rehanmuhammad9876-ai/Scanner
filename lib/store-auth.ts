
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'crypto';
import { supabase } from '@/lib/supabase';

export const STORE_SESSION_COOKIE = 'pls_store_session';

// Session berlaku maksimal 1 tahun.
const SESSION_DURATION = 365 * 24 * 60 * 60 * 1000;

export type StoreRole = 'spv' | 'assistant_spv' | 'staff';

export type StoreSession = {
  sessionId: string;
  userId: string;
  storeId: string;
  storeName: string;
  storeCode: string;
  fullName: string;
  role: StoreRole;
  expiresAt: string;
};

// Membuat hash PIN. PIN asli tidak disimpan di database.
export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(pin, salt, 64).toString('hex');

  return `scrypt$${salt}$${hash}`;
}

// Memeriksa PIN terhadap hash yang tersimpan.
export function verifyPin(pin: string, storedHash: string): boolean {
  try {
    const parts = storedHash.split('$');

    if (parts.length !== 3 || parts[0] !== 'scrypt') {
      return false;
    }

    const [, salt, savedHash] = parts;
    const calculated = scryptSync(pin, salt, 64);
    const original = Buffer.from(savedHash, 'hex');

    if (original.length !== calculated.length) {
      return false;
    }

    return timingSafeEqual(calculated, original);
  } catch {
    return false;
  }
}

// Mencari toko dan staff serta memverifikasi PIN.
export async function authenticateStoreUser(
  storeCode: string,
  fullName: string,
  pin: string
) {
  const cleanCode = storeCode.trim();
  const cleanName = fullName.trim();

  if (!cleanCode || !cleanName || !pin) {
    return null;
  }

  const { data: stores, error: storeError } = await supabase
    .from('stores')
    .select('id, store_name, store_code')
    .eq('is_active', true);

  if (storeError || !stores) {
  throw new Error(
    `Gagal memeriksa data toko: ${storeError?.message || 'Data toko tidak ditemukan'}`
  );
  }

  const store = stores.find(
    (item) =>
      item.store_code.trim().toLowerCase() === cleanCode.toLowerCase()
  );

  if (!store) return null;

  const { data: users, error: userError } = await supabase
    .from('store_users')
    .select('id, store_id, full_name, role, pin_hash')
    .eq('store_id', store.id)
    .eq('is_active', true);

  if (userError || !users) {
    throw new Error('Gagal memeriksa data pengguna');
  }

  const user = users.find(
    (item) =>
      item.full_name.trim().toLowerCase() === cleanName.toLowerCase()
  );

  const pinValid = user
  ? verifyPin(pin, user.pin_hash)
  : false;


if (!user || !pinValid) {
  return null;
}

  return {
    userId: user.id,
    storeId: store.id,
    storeName: store.store_name,
    storeCode: store.store_code,
    fullName: user.full_name,
    role: user.role as StoreRole,
  };
}

// Membuat session baru untuk staff.
export async function createStoreSession(userId: string) {
  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');

  const expiresAt = new Date(
    Date.now() + SESSION_DURATION
  ).toISOString();

  const { data, error } = await supabase
    .from('store_sessions')
    .insert({
      user_id: userId,
      token_hash: tokenHash,
      expires_at: expiresAt,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error('Gagal membuat session pengguna');
  }

  return {
    token,
    sessionId: data.id,
    expiresAt,
  };
}

// Memeriksa session dari token cookie.
export async function getStoreSession(
  token: string | undefined | null
): Promise<StoreSession | null> {
  if (!token) return null;

  try {
    const tokenHash = createHash('sha256')
      .update(token)
      .digest('hex');

    const now = new Date().toISOString();

    const { data: session, error: sessionError } = await supabase
      .from('store_sessions')
      .select('id, user_id, expires_at')
      .eq('token_hash', tokenHash)
      .is('revoked_at', null)
      .gt('expires_at', now)
      .maybeSingle();

    if (sessionError || !session) return null;

    const { data: user, error: userError } = await supabase
      .from('store_users')
      .select('id, store_id, full_name, role, is_active')
      .eq('id', session.user_id)
      .eq('is_active', true)
      .maybeSingle();

    if (userError || !user) return null;

    const { data: store, error: storeError } = await supabase
      .from('stores')
      .select('id, store_name, store_code, is_active')
      .eq('id', user.store_id)
      .eq('is_active', true)
      .maybeSingle();

    if (storeError || !store) return null;

    return {
      sessionId: session.id,
      userId: user.id,
      storeId: store.id,
      storeName: store.store_name,
      storeCode: store.store_code,
      fullName: user.full_name,
      role: user.role as StoreRole,
      expiresAt: session.expires_at,
    };
  } catch {
    return null;
  }
}

// Memutus session di server.
export async function revokeStoreSession(
  token: string | undefined | null
): Promise<void> {
  if (!token) return;

  const tokenHash = createHash('sha256')
    .update(token)
    .digest('hex');

  const { error } = await supabase
    .from('store_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('token_hash', tokenHash)
    .is('revoked_at', null);

  if (error) {
    throw new Error('Gagal mengakhiri session pengguna');
  }
}
