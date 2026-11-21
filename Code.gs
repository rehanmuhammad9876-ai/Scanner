const SHEET_NAME = 'PRICE_LABEL_SCAN';
function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.action === 'ping') return json({ok:true, message:'Apps Script connected'});
    const shelf = String(body.shelf || '').trim();
    const barcode = String(body.barcode || '').trim();
    const format = String(body.format || '');
    const timestamp = body.timestamp ? new Date(body.timestamp) : new Date();
    if (!shelf || !barcode) return json({ok:false, error:'Shelf and barcode required'});
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
    if (sheet.getLastRow() === 0) sheet.appendRow(['Tanggal','Jam','Shelf','Barcode','Format Lengkap']);
    const dateText = Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const timeText = Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'HH:mm:ss');
    const complete = `S,${shelf},${barcode}`;
    sheet.appendRow([dateText,timeText,shelf,barcode,complete + (format.startsWith('STOCK_TAKE_QTY:') ? ` | ${format}` : '')]);
    return json({ok:true});
  } catch (err) { return json({ok:false, error:String(err)}); }
}
function doGet() { return json({ok:true, service:'Price Label Scanner Sheet API'}); }
function json(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
