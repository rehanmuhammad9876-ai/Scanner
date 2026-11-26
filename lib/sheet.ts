export type ScanPayload = {
  shelf: string;
  barcode: string;
  format: string;
  timestamp: string;
};

export type SheetResult = {
  ok: boolean;
  message?: string;
};

export function getSheetUrl(): string {
  return "/api/sheet";
}

export async function sendScan(
  payload: ScanPayload
): Promise<SheetResult> {
  try {
    const response = await fetch(getSheetUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok || result?.ok === false) {
      return {
        ok: false,
        message: result?.error || result?.message || "Gagal menyimpan data",
      };
    }

    return {
      ok: true,
      message: result?.message || "Data berhasil dikirim ke Google Sheet",
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Gagal terhubung ke server",
    };
  }
}
export async function sendScanToSupabase(
  payload: ScanPayload & { id: string }
): Promise<SheetResult> {
  try {
    const response = await fetch('/api/scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok || result?.ok === false) {
      return {
        ok: false,
        message: result?.error || result?.message || 'Gagal menyimpan ke Supabase',
      };
    }

    return {
      ok: true,
      message: result?.message || 'Data berhasil disimpan ke Supabase',
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error
        ? error.message
        : 'Gagal terhubung ke Supabase',
    };
  }
}
