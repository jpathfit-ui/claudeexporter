// Google Sheet ledger for Claude Chat Exporter
// 1. Open your Sheet > Extensions > Apps Script. Paste this over the default code.
// 2. Change SECRET to a long random phrase.
// 3. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone.
// 4. Copy the web app URL. Paste it, with your secret, into the tool.
const SECRET = 'change-me-to-a-long-random-phrase';

function ledger_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName('Ledger');
  if (!s) {
    s = ss.insertSheet('Ledger');
    s.appendRow(['project', 'title', 'uuid', 'updated_at', 'file', 'exported_at']);
    s.getRange('A:F').setNumberFormat('@');
  }
  return s;
}
function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function doGet(e) {
  if (e.parameter.key !== SECRET) return out_({ error: 'denied' });
  const v = ledger_().getDataRange().getValues().slice(1);
  return out_({ rows: v.map(r => ({ uuid: String(r[2]), updated_at: String(r[3]) })) });
}
function doPost(e) {
  const d = JSON.parse(e.postData.contents);
  if (d.key !== SECRET) return out_({ error: 'denied' });
  const s = ledger_();
  const now = new Date().toISOString();
  const rows = d.rows.map(r => [r.project, r.title, r.uuid, r.updated_at, r.file, now]);
  if (rows.length) s.getRange(s.getLastRow() + 1, 1, rows.length, 6).setNumberFormat('@').setValues(rows);
  return out_({ added: rows.length });
}
