// Google Sheet ledger for Claude Transfer
// 1. Open your Sheet > Extensions > Apps Script. Paste this over the default code.
// 2. Change SECRET to a long random phrase (a few random words, 30+ characters).
// 3. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone.
//    (The secret is the lock, so keep it long and private.)
// 4. Copy the web app URL. Paste it, with your secret, into the tool.
// If you change this script later, use Deploy > Manage deployments > Edit > New version.
const SECRET = 'change-me-to-a-long-random-phrase';
const MAX_ROWS = 5000; // per request

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
// Compare without stopping at the first wrong character.
function same_(a, b) {
  a = String(a || ''); b = String(b || '');
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
function rowKey_(project, uuid, updated) { return [project, uuid, updated].map(String).join('|'); }

// The secret only ever arrives in the body of a POST, never in the web address, so it
// does not end up in browser history or server logs.
function doGet() {
  return out_({ error: 'Use the Claude Transfer app. Nothing is served here.' });
}
function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (SECRET === 'change-me-to-a-long-random-phrase') return out_({ error: 'Set a real SECRET in the script first.' });
    if (!same_(d.key, SECRET)) return out_({ error: 'denied' });

    if (d.action === 'list') {
      const v = ledger_().getDataRange().getValues().slice(1);
      return out_({ rows: v.map(r => ({ project: String(r[0]), title: String(r[1]), uuid: String(r[2]), updated_at: String(r[3]), file: String(r[4]) })) });
    }
    if (d.action === 'add') {
      if (!Array.isArray(d.rows)) return out_({ error: 'No rows sent.' });
      if (d.rows.length > MAX_ROWS) return out_({ error: 'Too many rows in one request (max ' + MAX_ROWS + ').' });
      // One send at a time, so two devices cannot write over each other's rows.
      const lock = LockService.getScriptLock();
      lock.waitLock(30000);
      try {
        const s = ledger_();
        const have = {};
        s.getDataRange().getValues().slice(1).forEach(r => { have[rowKey_(r[0], r[2], r[3])] = 1; });
        const now = new Date().toISOString();
        const fresh = [];
        d.rows.forEach(r => {
          const k = rowKey_(r.project, r.uuid, r.updated_at);
          if (have[k]) return;         // already there: sending twice is harmless
          have[k] = 1;
          fresh.push([r.project, r.title, r.uuid, r.updated_at, r.file, now].map(x => x == null ? '' : String(x)));
        });
        if (fresh.length) s.getRange(s.getLastRow() + 1, 1, fresh.length, 6).setNumberFormat('@').setValues(fresh);
        return out_({ added: fresh.length, skipped: d.rows.length - fresh.length });
      } finally {
        lock.releaseLock();
      }
    }
    return out_({ error: 'Unknown action.' });
  } catch (err) {
    return out_({ error: 'Script error: ' + err.message });
  }
}
