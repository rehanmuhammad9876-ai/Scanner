# Price Label Scanner
Mobile-first Next.js + TypeScript + Tailwind PWA barcode scanner.

## Local run
1. Install Node.js 20 or later.
2. Run `npm install`.
3. Run `npm run dev` and open `http://localhost:3000`.
4. Camera access requires HTTPS (localhost is allowed for local development).

## Google Sheet / Apps Script
1. Create or open a Google Spreadsheet.
2. In the spreadsheet, open Extensions → Apps Script.
3. Paste `Code.gs` from this project and save.
4. Deploy → New deployment → type Web app.
5. Execute as: **Me**. Who has access: **Anyone**. Deploy and authorize.
6. Copy the deployed `/exec` URL.
7. Open the scanner's Setting page and paste the URL, save, then Test Koneksi.
8. The script automatically creates `PRICE_LABEL_SCAN` and the header row.

The Sheet columns are Tanggal, Jam, Shelf, Barcode, Format Lengkap. Price Label records use `S,SHELF,BARCODE` in Format Lengkap. Stock Take records use the same columns and store quantity in Format Lengkap as an appended `STOCK_TAKE_QTY:n` note.


## Vercel deployment
1. Push this project to GitHub.
2. Import the repository into Vercel. Framework preset should be Next.js; build command `next build`.
3. Optional environment variable: `NEXT_PUBLIC_SHEET_API_URL` with your Apps Script Web App `/exec` URL. You can also configure it per device from `/setting` (localStorage takes priority).
4. Deploy. Camera scanning is available on HTTPS.
5. On Android Chrome, open the deployed site → browser menu → Install app / Add to Home screen.

## PWA/offline behavior
The service worker caches the root shell and static assets. Scan records are stored locally in localStorage and attempt upload immediately. Failed/offline items remain in the list and are retried when the device comes online or when the user presses **Kirim Ulang**. Keep this app open after reconnecting for the online event to trigger.

## Important
- Apps Script must be deployed with access Anyone, otherwise browser requests can fail.
- Apps Script and spreadsheet must be accessible to the deploying Google account.
- Verify duplicate scans and spreadsheet writes in a real warehouse device before operational use.
