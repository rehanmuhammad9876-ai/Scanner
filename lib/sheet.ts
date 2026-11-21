
export async function sendScan(payload: ScanPayload): Promise<SheetResult> {
  const url = getSheetUrl();

  if (!url) {
    return { ok: false, message: 'URL Google Sheet belum diatur' };
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        ok: false,
        message: `HTTP ${response.status}`,
      };
    }

    if (result && result.ok === false) {
      return {
        ok: false,
        message: result.error || result.message || 'Apps Script menolak data',
      };
    }

    return { ok: true, message: result?.message || 'Data berhasil dikirim' };

  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Gagal terhubung',
    };
  }
}
