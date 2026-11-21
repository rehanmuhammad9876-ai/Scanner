export type ScanPayload = { shelf: string; barcode: string; format: string; timestamp: string };
export type SheetResult = { ok: boolean; message?: string };

export function getSheetUrl(): string {
  if (typeof window === 'undefined') return process.env.NEXT_PUBLIC_SHEET_API_URL ?? '';
  return localStorage.getItem('pls_sheet_url') || process.env.NEXT_PUBLIC_SHEET_API_URL || '';
}
export async function sendScan(payload: ScanPayload): Promise<SheetResult> {
  const url = getSheetUrl();
  if (!url) return { ok: false, message: 'URL Google Sheet belum diatur' };
  try {
    const response = await fetch(url, { method: 'POST', mode: 'cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
    if (!response.ok) return { ok: false, message: `HTTP ${response.status}` };
    const result: unknown = await response.json().catch(() => ({ ok: true }));
    if (typeof result === 'object' && result !== null && 'ok' in result && (result as {ok?: boolean}).ok === false) return { ok: false, message: 'Apps Script menolak data' };
    return { ok: true };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : 'Gagal terhubung' }; }
}
