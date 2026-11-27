
'use client';

import { useCallback, useEffect, useState } from 'react';

declare global {
  interface Window {
    gapi?: {
      load: (
        name: string,
        options: { callback: () => void }
      ) => void;
    };
    google?: {
      picker: {
        PickerBuilder: new () => {
          addView: (view: unknown) => unknown;
          setOAuthToken: (token: string) => unknown;
          setDeveloperKey: (key: string) => unknown;
          setAppId: (id: string) => unknown;
          setCallback: (callback: (data: Record<string, unknown>) => void) => unknown;
          build: () => { setVisible: (visible: boolean) => void };
        };
        DocsView: new (viewId: string) => unknown;
        ViewId: { SPREADSHEETS: string };
        Action: { PICKED: string };
        Response: { ACTION: string; DOCUMENTS: string };
        Document: { ID: string; NAME: string };
      };
    };
  }
}

const PROJECT_NUMBER = '272357372136';

type AccountInfo = {
  connected: boolean;
  email?: string;
  spreadsheetSelected?: boolean;
  spreadsheetName?: string | null;
};

export default function GoogleSheetConnect() {
  const [account, setAccount] = useState<AccountInfo>({
    connected: false,
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const checkAccount = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/google/me', {
        cache: 'no-store',
      });

      const result = await response.json();

      if (response.ok && result.connected) {
        setAccount(result);
      } else {
        setAccount({ connected: false });
      }
    } catch {
      setAccount({ connected: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkAccount();
  }, [checkAccount]);

  const logoutAccount = async () => {
    setBusy(true);
    setMessage('');

    try {
      const response = await fetch('/api/auth/google/logout', {
        method: 'POST',
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error('Gagal memutus akun Google');
      }

      setAccount({ connected: false });
      setMessage('Akun berhasil diputus. Silakan login dengan akun lain.');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Gagal mengganti akun Google'
      );
    } finally {
      setBusy(false);
    }
  };

  const loadPicker = async () => {
    if (window.gapi) {
      await new Promise<void>((resolve) => {
        window.gapi!.load('picker', {
          callback: resolve,
        });
      });
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.async = true;
      script.onload = () => {
        if (!window.gapi) {
          reject(new Error('Google API gagal dimuat'));
          return;
        }

        window.gapi.load('picker', {
          callback: resolve,
        });
      };
      script.onerror = () => reject(
        new Error('Gagal memuat Google Picker')
      );
      document.head.appendChild(script);
    });
  };

  const chooseSpreadsheet = async () => {
    setBusy(true);
    setMessage('');

    try {
      const tokenResponse = await fetch(
        '/api/auth/google/access-token',
        { cache: 'no-store' }
      );

      const tokenData = await tokenResponse.json();

      if (!tokenResponse.ok || !tokenData.accessToken) {
        throw new Error(
          tokenData.error || 'Gagal mendapatkan akses Google'
        );
      }

      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;

      if (!apiKey) {
        throw new Error('Google API Key belum dikonfigurasi');
      }

      await loadPicker();

      const picker = window.google?.picker;

      if (!picker) {
        throw new Error('Google Picker tidak tersedia');
      }

      let builder = new picker.PickerBuilder();

      builder = builder.addView(
        new picker.DocsView(picker.ViewId.SPREADSHEETS)
      ) as typeof builder;

      builder = builder.setOAuthToken(
        tokenData.accessToken
      ) as typeof builder;

      builder = builder.setDeveloperKey(apiKey) as typeof builder;

      builder = builder.setAppId(
        PROJECT_NUMBER
      ) as typeof builder;

      builder = builder.setCallback(async (data) => {
        const action = data[picker.Response.ACTION];

        if (action !== picker.Action.PICKED) return;

        const documents = data[picker.Response.DOCUMENTS];

        if (!Array.isArray(documents) || !documents.length) {
          setMessage('Spreadsheet belum dipilih');
          setBusy(false);
          return;
        }

        const document = documents[0] as Record<string, unknown>;
        const spreadsheetId = document[picker.Document.ID];

        if (typeof spreadsheetId !== 'string') {
          setMessage('ID spreadsheet tidak valid');
          setBusy(false);
          return;
        }

        try {
          const response = await fetch(
            '/api/auth/google/spreadsheet',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ spreadsheetId }),
            }
          );

          const result = await response.json();

          if (!response.ok || !result.ok) {
            throw new Error(
              result.error || 'Gagal menyimpan spreadsheet'
            );
          }

          setAccount((previous) => ({
            ...previous,
            connected: true,
            spreadsheetSelected: true,
            spreadsheetName: result.spreadsheetName,
          }));

          setMessage('Spreadsheet berhasil dihubungkan');
        } catch (error) {
          setMessage(
            error instanceof Error
              ? error.message
              : 'Gagal menyimpan spreadsheet'
          );
        } finally {
          setBusy(false);
        }
      }) as typeof builder;

      builder.build().setVisible(true);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Gagal membuka Google Picker'
      );
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border bg-white p-4 text-sm text-slate-500">
        Memeriksa koneksi Google...
      </div>
    );
  }

  return (
    <section className="rounded-2xl border bg-white p-4 space-y-3">
      <div>
        <div className="font-black text-lg">
          GOOGLE SHEET TOKO
        </div>
        <div className="text-xs text-slate-500">
          Hubungkan akun dan pilih spreadsheet toko
        </div>
      </div>

      {account.connected ? (
        <>
          <div className="rounded-xl bg-green-50 p-3">
            <div className="text-sm font-bold text-green-800">
              Google terhubung
            </div>
            <div className="text-xs text-green-700 break-all">
              {account.email}
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-xs text-slate-500">
              Spreadsheet aktif
            </div>
            <div className="font-bold break-all">
              {account.spreadsheetSelected
                ? account.spreadsheetName || 'Spreadsheet dipilih'
                : 'Belum dipilih'}
            </div>
          </div>

          <button
            onClick={() => void chooseSpreadsheet()}
            disabled={busy}
            className="w-full rounded-xl bg-indigo-900 p-3 font-bold text-white disabled:opacity-50"
          >
            {busy
              ? 'Memproses...'
              : account.spreadsheetSelected
                ? 'Ganti Spreadsheet'
                : 'Pilih Spreadsheet Toko'}
          </button>
          
          <button
            onClick={() => void logoutAccount()}
            disabled={busy}
            className="w-full rounded-xl border border-red-300 p-3 font-bold text-red-700 disabled:opacity-50"
          >
            {busy ? 'Memproses...' : 'Ganti Akun Google'}
          </button>

        </>
      ) : (
        <a
          href="/api/auth/google"
          className="block w-full rounded-xl bg-indigo-900 p-3 text-center font-bold text-white"
        >
          Hubungkan Akun Google
        </a>
      )}

      {message && (
        <div className="rounded-lg bg-slate-100 p-3 text-sm">
          {message}
        </div>
      )}
    </section>
  );
}
