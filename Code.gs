const SHEET_NAME = "PRICE_LABEL_SCAN";
const SPREADSHEET_ID = "1b2DIiOFUoIMAooAm1jLCY7kssIP8aHzkrMHm45F-7so";
function json(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || "{}");

    if (body.action === "ping") {
      return json({ ok: true, message: "Koneksi berhasil" });
    }

    const shelf = String(body.shelf || "").trim();
    const barcode = String(body.barcode || body.sku || "").trim();

    if (!shelf || !barcode) {
      return json({
        ok: false,
        error: "Shelf atau barcode kosong",
        shelf: shelf,
        barcode: barcode
      });
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    const sheet = ss.getSheetByName(SHEET_NAME);

    if (!sheet) {
      return json({
        ok: false,
        error: "Sheet tidak ditemukan: " + SHEET_NAME,
        sheets: ss.getSheets().map(s => s.getName())
      });
    }

    sheet.appendRow([shelf, barcode]);

    return json({
      ok: true,
      message: "Data berhasil disimpan",
      shelf: shelf,
      barcode: barcode
    });

  } catch (err) {
    return json({
      ok: false,
      error: err.message || String(err)
    });
  }
}

function doGet() {
  return json({
    ok: true,
    message: "Apps Script aktif"
  });
}
