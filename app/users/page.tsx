
'use client';

import { useEffect, useState } from 'react';

type StoreUser = {
  id: string;
  full_name: string;
  role: 'spv' | 'assistant_spv' | 'staff';
  is_active: boolean;
  created_at: string;
};

export default function UsersPage() {
  const [users, setUsers] = useState<StoreUser[]>([]);
  const [fullName, setFullName] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const loadUsers = async () => {
    setLoading(true);

    try {
      const response = await fetch('/api/auth/store/users', {
        credentials: 'include',
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setMessage(data.error || 'Gagal mengambil daftar pengguna.');
        return;
      }

      setUsers(data.users || []);
    } catch {
      setMessage('Koneksi gagal.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const addUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');

    if (!fullName.trim() || !/^\d{6}$/.test(pin)) {
      setMessage('Nama wajib diisi dan PIN harus 6 angka.');
      return;
    }

    setSaving(true);

    try {
      const response = await fetch('/api/auth/store/users', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fullName, pin }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        setMessage(data.error || 'Gagal menambahkan staff.');
        return;
      }

      setFullName('');
      setPin('');
      setMessage('Akun staff berhasil ditambahkan.');
      await loadUsers();
    } catch {
      setMessage('Koneksi gagal. Silakan coba kembali.');
    } finally {
      setSaving(false);
    }
  };

const updateUser = async (
  user: StoreUser,
  action: 'reset_pin' | 'set_active'
) => {
  let body: {
    userId: string;
    action: string;
    pin?: string;
    isActive?: boolean;
  } = {
    userId: user.id,
    action,
  };

  if (action === 'reset_pin') {
    const newPin = window.prompt(
      `Masukkan PIN baru untuk ${user.full_name} (6 angka):`
    );

    if (newPin === null) return;

    if (!/^\d{6}$/.test(newPin)) {
      setMessage('PIN harus terdiri dari 6 angka.');
      return;
    }

    body.pin = newPin;
  } else {
    const nextStatus = !user.is_active;

    if (
      !window.confirm(
        nextStatus
          ? `Aktifkan kembali akun ${user.full_name}?`
          : `Nonaktifkan akun ${user.full_name}?`
      )
    ) return;

    body.isActive = nextStatus;
  }

  try {
    const response = await fetch('/api/auth/store/users', {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      setMessage(data.error || 'Gagal memperbarui akun.');
      return;
    }

    setMessage(data.message);
    await loadUsers();
  } catch {
    setMessage('Koneksi gagal. Silakan coba kembali.');
  }
};

  return (
    <main className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto max-w-xl space-y-4">
        <header className="rounded-2xl bg-indigo-950 p-5 text-white">
          <a href="/" className="text-sm text-indigo-200">
            ← Kembali ke Scanner
          </a>
          <h1 className="mt-3 text-2xl font-black">
            MANAJEMEN STAFF
          </h1>
          <p className="mt-1 text-sm text-indigo-200">
            Kelola akun pengguna toko
          </p>
        </header>

        <form
          onSubmit={addUser}
          className="space-y-3 rounded-2xl border bg-white p-4"
        >
          <h2 className="text-lg font-black">Tambah Staff</h2>

          <div>
            <label className="mb-1 block text-sm font-bold">
              Nama Lengkap
            </label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Masukkan nama staff"
              className="w-full rounded-xl border-2 p-3"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold">
              PIN Login (6 angka)
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) =>
                setPin(e.target.value.replace(/\D/g, '').slice(0, 6))
              }
              placeholder="Masukkan 6 angka"
              className="w-full rounded-xl border-2 p-3"
              required
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-teal-600 p-3 font-bold text-white disabled:opacity-50"
          >
            {saving ? 'Menyimpan...' : 'Tambah Staff'}
          </button>

          {message && (
            <p className="rounded-lg bg-slate-100 p-3 text-sm font-semibold">
              {message}
            </p>
          )}
        </form>

        <section className="rounded-2xl border bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-black">Daftar Pengguna</h2>
            <button
              onClick={() => void loadUsers()}
              className="rounded-lg bg-indigo-100 px-3 py-2 text-sm font-bold text-indigo-900"
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <p className="py-5 text-center text-slate-500">
              Memuat pengguna...
            </p>
          ) : users.length === 0 ? (
            <p className="py-5 text-center text-slate-500">
              Belum ada pengguna.
            </p>
          ) : (
            <div className="space-y-2">
              {users.map((user) => (
                <article
                  key={user.id}
                  className="rounded-xl border p-3"
                >
                  <div className="font-bold">{user.full_name}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {user.role === 'spv'
                      ? 'SPV'
                      : user.role === 'assistant_spv'
                      ? 'Assistant SPV'
                      : 'Staff'}
                    {' · '}
                    {user.is_active ? 'Aktif' : 'Nonaktif'}
                  </div>
                  
{user.role === 'staff' && (
  <div className="mt-3 grid grid-cols-2 gap-2">
    <button
      onClick={() => void updateUser(user, 'reset_pin')}
      className="rounded-lg bg-indigo-100 p-2 text-sm font-bold text-indigo-900"
    >
      Reset PIN
    </button>

    <button
      onClick={() => void updateUser(user, 'set_active')}
      className={`rounded-lg p-2 text-sm font-bold ${
        user.is_active
          ? 'bg-red-100 text-red-700'
          : 'bg-teal-100 text-teal-700'
      }`}
    >
      {user.is_active ? 'Nonaktifkan' : 'Aktifkan'}
    </button>
  </div>
)}

                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
