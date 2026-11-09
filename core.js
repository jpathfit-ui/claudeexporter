/* Claude Transfer: core logic.
   Pure functions only (no DOM), so the same file runs in the browser (window.CT) and in Node tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CT = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- text keys ---------- */

  // Compare titles loosely: Unicode-aware (accents and non-English letters survive),
  // punctuation removed, whitespace collapsed, case ignored.
  function norm(s) {
    return String(s == null ? '' : s).normalize('NFKC').toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}\s]/gu, '')
      .replace(/\s+/g, ' ').trim();
  }
  // A title made only of symbols or emoji normalises to '', which would make every such title
  // match every other one. Fall back to the raw text so they stay distinct.
  function key(s) {
    var n = norm(s);
    return n || ('~' + String(s == null ? '' : s).trim().toLowerCase());
  }
  function safe(s, fallback) {
    var r = String(s == null ? '' : s).normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '');
    return r || fallback || 'Project';
  }
  function safeFile(name, fallback) {
    var s = String(name == null ? '' : name).replace(/[\\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '').trim();
    return s || fallback;
  }
  function uniqueName(name, used) {
    var base = name, ext = '', dot = name.lastIndexOf('.');
    if (dot > 0 && name.length - dot <= 6) { base = name.slice(0, dot); ext = name.slice(dot); }
    var out = name, n = 1;
    while (used[out.toLowerCase()]) { n++; out = base + ' (' + n + ')' + ext; }
    used[out.toLowerCase()] = 1;
    return out;
  }

  /* ---------- chat index and matching ---------- */

  function makeIndex(convs) {
    var by = {}, nn = [], tok = [];
    convs.forEach(function (c, i) {
      var k = key(c.name);
      (by[k] = by[k] || []).push(c);
      var n = norm(c.name);
      nn.push(n);
      var seen = {}, arr = [];
      (n ? n.split(' ') : []).forEach(function (w) { if (!seen[w]) { seen[w] = 1; arr.push(w); } });
      tok.push(arr);
    });
    return { convs: convs, by: by, nn: nn, tok: tok };
  }
  // Exact (loose) title match. A title ending in the ellipsis character is treated as a prefix,
  // because the sidebar truncates long titles.
  function find(idx, title) {
    if (!idx) return [];
    var t = String(title == null ? '' : title).trim();
    var ex = idx.by[key(t)] || [];
    if (!ex.length && t.slice(-1) === '…') {
      var nk = norm(t);
      if (nk) ex = idx.convs.filter(function (c, i) { return idx.nn[i].indexOf(nk) === 0; });
    }
    return ex;
  }
  // Closest chat titles for a title that was not found.
  function suggest(idx, title, limit, min) {
    if (!idx) return [];
    var n = norm(title);
    if (!n) return [];
    var ta = {}, na = 0;
    n.split(' ').forEach(function (w) { if (!ta[w]) { ta[w] = 1; na++; } });
    var scored = [];
    idx.convs.forEach(function (c, i) {
      var tb = idx.tok[i];
      if (!tb.length) return;
      var inter = 0;
      tb.forEach(function (w) { if (ta[w]) inter++; });
      var score = inter / (na + tb.length - inter);
      var nb = idx.nn[i];
      if (nb && n.length >= 8 && (nb.indexOf(n) >= 0 || n.indexOf(nb) >= 0) && nb.length >= 8) score = Math.max(score, 0.75);
      if (score >= (min || 0.5)) scored.push({ title: c.name, score: score });
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    var out = [], seen = {};
    scored.forEach(function (s) {
      if (out.length >= (limit || 1) || seen[s.title]) return;
      seen[s.title] = 1; out.push(s);
    });
    return out;
  }

  /* ---------- pasted project lists ---------- */

  var BULLET = /^([-*•]|\d+[.)])\s*/;
  // `isKnown(title)` says whether a title exists in the export (or is null before the export loads).
  function parseLists(txt, isKnown) {
    var L = String(txt || '').split(/\r?\n/), map = {}, order = [], cur = null, lastNB = -1, i;
    // If any line starts with #, headings are explicit. The "a line before a blank line is a heading"
    // guess only applies to plain lists with no # at all; otherwise the last title of every block
    // would turn into a bogus project.
    var explicit = L.some(function (x) { return /^\s*#/.test(x); });
    // Claude's reply is a code block plus a closing sentence. When the paste has fenced blocks,
    // text outside them is ignored (so that sentence never becomes a chat title), unless it
    // contains its own # headings, in which case it counts from the first heading on.
    var fenced = L.filter(function (x) { return /^\s*```/.test(x); }).length >= 2, inFence = [], ins = false, r0 = 0, k;
    function flush(end) {
      var h = -1;
      for (k = r0; k < end; k++) if (/^\s*#/.test(L[k])) { h = k; break; }
      for (k = r0; k < end; k++) inFence[k] = !fenced || ins || (h >= 0 && k >= h);
    }
    for (i = 0; i < L.length; i++) {
      if (/^\s*```/.test(L[i])) { flush(i); inFence[i] = false; ins = !ins; r0 = i + 1; }
    }
    flush(L.length);
    for (i = L.length - 1; i >= 0; i--) {
      var s = L[i].trim();
      if (s && inFence[i]) { lastNB = i; break; }
    }
    for (i = 0; i < L.length; i++) {
      var l = L[i].trim();
      if (!l || !inFence[i]) continue;
      var nextBlank = i + 1 < L.length && L[i + 1].trim() === '';
      var t = l.replace(BULLET, '');
      var head = l.charAt(0) === '#' || (!explicit && nextBlank && i < lastNB && (!isKnown || !isKnown(t)));
      if (head) {
        var name = l.replace(/^#+\s*/, '').trim();
        if (!name) continue;
        if (!map[name]) { map[name] = { name: name, titles: [], seen: {} }; order.push(name); }
        cur = map[name];
      } else {
        if (!cur) { cur = { name: 'Project', titles: [], seen: {} }; map.Project = cur; order.push('Project'); }
        var tk = key(t);
        if (!cur.seen[tk]) { cur.seen[tk] = 1; cur.titles.push(t); }
      }
    }
    return order.map(function (n) { return map[n]; });
  }

  /* ---------- project files from the export ---------- */

  function normalizeProjects(values) {
    var out = [], seen = {};
    function add(p) {
      if (!p || typeof p !== 'object' || Array.isArray(p)) return;
      if (!('docs' in p) && !('prompt_template' in p)) return; // chats have neither
      var id = p.uuid || ('n' + out.length);
      if (seen[id]) return;
      seen[id] = 1;
      out.push({
        uuid: p.uuid || '',
        name: String(p.name || '').trim(),
        description: p.description || '',
        instructions: p.prompt_template || p.instructions || '',
        created_at: p.created_at || '',
        updated_at: p.updated_at || '',
        starter: !!p.is_starter_project,
        docs: (p.docs || p.documents || []).map(function (d) {
          d = d || {};
          return { filename: String(d.filename || d.file_name || '').trim(), content: d.content == null ? '' : String(d.content), created_at: d.created_at || '' };
        })
      });
    }
    (values || []).forEach(function (v) {
      if (Array.isArray(v)) v.forEach(add);
      else if (v && Array.isArray(v.projects)) v.projects.forEach(add);
      else add(v);
    });
    return out;
  }
  // Unnamed projects with nothing in them are placeholders (deleted or never used).
  function isBlankProject(p) {
    return !p.name && !String(p.description).trim() && !String(p.instructions).trim() &&
      !p.docs.some(function (d) { return d.filename || String(d.content).trim(); });
  }
  function matchProject(projects, heading) {
    var k = key(heading), i, best = null, bestScore = 0;
    for (i = 0; i < projects.length; i++) if (projects[i].name && key(projects[i].name) === k) return projects[i];
    var ta = norm(heading).split(' ').filter(Boolean);
    if (!ta.length) return null;
    projects.forEach(function (p) {
      var tb = norm(p.name).split(' ').filter(Boolean);
      if (!tb.length) return;
      var set = {}, inter = 0;
      ta.forEach(function (w) { set[w] = 1; });
      tb.forEach(function (w) { if (set[w]) inter++; });
      var score = inter / (new Set(ta.concat(tb)).size);
      if (score > bestScore) { bestScore = score; best = p; }
    });
    return bestScore >= 0.6 ? best : null;
  }
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function projectLink(uuid) { return UUID.test(uuid || '') ? 'https://claude.ai/project/' + uuid : ''; }
  function chatLink(uuid) { return UUID.test(uuid || '') ? 'https://claude.ai/chat/' + uuid : ''; }

  // Instructions, description and documents as separate files (documents become knowledge files).
  function projectFiles(p) {
    var files = [];
    if (String(p.instructions).trim()) files.push({ path: 'instructions.md', text: p.instructions });
    if (String(p.description).trim()) files.push({ path: 'description.md', text: p.description });
    var used = {};
    p.docs.forEach(function (d, i) {
      if (!d.filename && !String(d.content).trim()) return;
      var nm = uniqueName(safeFile(d.filename, 'document-' + (i + 1) + '.txt'), used);
      files.push({ path: 'knowledge/' + nm, text: d.content });
    });
    return files;
  }

  /* ---------- message text (fidelity) ---------- */

  var DEFAULT_OPTS = { artifacts: true, attachmentText: true, tools: false, thinking: false };

  function fenceFor(t) {
    var m = (String(t).match(/`+/g) || []).reduce(function (a, b) { return Math.max(a, b.length); }, 0);
    return '`'.repeat(Math.max(3, m + 1));
  }
  function codeBlock(t, lang) {
    t = t == null ? '' : String(t);
    var f = fenceFor(t);
    return f + (lang || '') + '\n' + t + '\n' + f;
  }
  function quote(t) { return String(t).split('\n').map(function (x) { return '> ' + x; }).join('\n'); }
  function safeJson(o) { try { return JSON.stringify(o, null, 2); } catch (e) { return String(o); } }
  function toolResultText(b) {
    var c = b.content;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) return c.map(function (x) { return x && typeof x === 'object' ? (x.text != null ? x.text : safeJson(x)) : String(x); }).join('\n');
    return safeJson(c);
  }
  function artifactText(inp) {
    var title = inp.title || inp.id || 'untitled', type = inp.type ? ' (' + inp.type + ')' : '';
    if (inp.command === 'update') {
      return '[Artifact update: ' + title + ']\n' + (inp.old_str != null ? 'Replace:\n' + codeBlock(inp.old_str) + '\nWith:\n' : '') + codeBlock(inp.new_str);
    }
    var lang = inp.language || (inp.type && /code/.test(inp.type) ? '' : '');
    return '[Artifact: ' + title + type + ']\n' + codeBlock(inp.content, lang);
  }
  function messageBody(m, o) {
    o = o || DEFAULT_OPTS;
    var pieces = [], hasText = false;
    if (Array.isArray(m.content) && m.content.length) {
      m.content.forEach(function (b) {
        if (!b || typeof b !== 'object') return;
        if (b.type === 'text') {
          if (b.text && String(b.text).trim()) { pieces.push(b.text); hasText = true; }
        } else if (b.type === 'thinking') {
          if (o.thinking && b.thinking) pieces.push('[Thinking]\n' + quote(b.thinking));
        } else if (b.type === 'tool_use') {
          if (b.name === 'artifacts') { if (o.artifacts) pieces.push(artifactText(b.input || {})); }
          else if (o.tools) pieces.push('[Tool call: ' + (b.name || 'tool') + ']\n' + codeBlock(safeJson(b.input || {}), 'json'));
        } else if (b.type === 'tool_result') {
          if (o.tools) pieces.push('[Tool result' + (b.name ? ': ' + b.name : '') + ']\n' + codeBlock(toolResultText(b)));
        }
      });
      if (!hasText && m.text && String(m.text).trim()) pieces.unshift(m.text);
    } else {
      pieces.push(m.text || '');
    }
    return pieces.join('\n\n');
  }
  function attachmentsText(m, o) {
    o = o || DEFAULT_OPTS;
    var names = [], bodies = [];
    (m.attachments || []).forEach(function (a) {
      if (!a) return;
      var n = a.file_name || 'attachment';
      names.push(n);
      if (o.attachmentText && a.extracted_content && String(a.extracted_content).trim()) {
        bodies.push('[Attachment contents: ' + n + ']\n' + codeBlock(a.extracted_content));
      }
    });
    (m.files || []).forEach(function (f) { if (f && f.file_name) names.push(f.file_name); });
    var out = '';
    if (names.length) out += '[Attachments: ' + names.join(', ') + ']\n';
    if (bodies.length) out += bodies.join('\n\n') + '\n\n';
    return out;
  }
  function formatMessage(m, o) {
    var who = m.sender === 'human' ? 'USER' : 'CLAUDE';
    var ts = (m.created_at || '').slice(0, 16).replace('T', ' ');
    return '\n## ' + who + ' (' + ts + ')\n\n' + attachmentsText(m, o) + messageBody(m, o) + '\n';
  }

  /* ---------- splitting into parts ---------- */

  var CONT_NOTE = '\n\n[chat continues in the next part]\n';
  var RESERVE = 400; // room for the file's own title line
  function chatHeader(c, cont) {
    var n = c.name || '(untitled)';
    if (cont) return '\n\n---\n\n# CHAT (continued): ' + n + '\n';
    return '\n\n---\n\n# CHAT: ' + n + '\nCreated: ' + c.created_at + ' | Updated: ' + c.updated_at + ' | Messages: ' + (c.chat_messages || []).length + '\n';
  }
  // Split one long string at paragraph, then line, then word boundaries so no piece exceeds max.
  function splitText(s, max) {
    var out = [];
    while (s.length > max) {
      var cut = s.lastIndexOf('\n\n', max);
      if (cut < max * 0.5) cut = s.lastIndexOf('\n', max);
      if (cut < max * 0.5) cut = s.lastIndexOf(' ', max);
      if (cut < max * 0.5) cut = max;
      var hi = s.charCodeAt(cut - 1);
      if (hi >= 0xD800 && hi <= 0xDBFF) cut -= 1; // never split a surrogate pair
      if (cut < 1) cut = max;
      out.push(s.slice(0, cut));
      s = s.slice(cut);
    }
    if (s) out.push(s);
    return out;
  }
  // Pack whole chats into parts of at most `limit` characters; split a chat across parts when it
  // is too big, and split a single message when that alone is too big.
  function buildParts(chats, limit, opts) {
    var LIM = Math.max(2000, (limit || 420000) - RESERVE), parts = [{ text: '', owners: [] }];
    function cur() { return parts[parts.length - 1]; }
    function newPart() { parts.push({ text: '', owners: [] }); }
    function add(txt, c) { var p = cur(); p.text += txt; if (p.owners.indexOf(c) < 0) p.owners.push(c); }
    chats.forEach(function (c) {
      var hdr = chatHeader(c, false), ms = (c.chat_messages || []).map(function (m) { return formatMessage(m, opts); });
      var total = hdr.length;
      ms.forEach(function (s) { total += s.length; });
      if (cur().text.length + total <= LIM) { add(hdr + ms.join(''), c); return; }
      if (total <= LIM) { newPart(); add(hdr + ms.join(''), c); return; }
      // Too big for one part: stream it, starting in the space left beside earlier chats.
      var cont = chatHeader(c, true), buf = hdr, started = false, guard = 0;
      ms.forEach(function (s) {
        var p = s;
        while (p.length && guard++ < 1e6) {
          var room = LIM - cur().text.length - buf.length - CONT_NOTE.length;
          if (p.length <= room) { buf += p; started = true; break; }
          if (room >= 1000) {
            // fill the space left in this part, then carry on in the next one
            var head = splitText(p, room)[0];
            buf += head; p = p.slice(head.length); started = true;
            add(buf + CONT_NOTE, c); newPart(); buf = cont;
          } else if (!started && cur().text.length > 0) {
            newPart(); // no useful room beside earlier chats: start a fresh part
          } else {
            add(buf + CONT_NOTE, c); newPart(); buf = cont;
          }
        }
      });
      add(buf, c);
    });
    if (parts.length > 1 && !cur().text) parts.pop();
    return parts;
  }
  function transcriptFiles(projectName, parts) {
    var base = safe(projectName, 'Project'), N = parts.length;
    return parts.map(function (pt, i) {
      var fn = base + (N > 1 ? '_Part' + String(i + 1).padStart(2, '0') : '_Full_Chats') + '.md';
      return { name: fn, owners: pt.owners, text: '# ' + projectName + ': full chat transcripts' + (N > 1 ? ' (part ' + (i + 1) + ' of ' + N + ')' : '') + '\n' + pt.text };
    });
  }

  /* ---------- ledger ---------- */

  function ledgerKey(r) { return (r.project || '') + '|' + r.uuid + '|' + r.updated_at; }
  function parseCSV(text) {
    var rows = [], row = [], f = '', q = false, i, ch;
    text = String(text).replace(/^﻿/, '');
    for (i = 0; i < text.length; i++) {
      ch = text.charAt(i);
      if (q) {
        if (ch === '"') { if (text.charAt(i + 1) === '"') { f += '"'; i++; } else q = false; }
        else f += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { row.push(f); f = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text.charAt(i + 1) === '\n') i++;
        row.push(f); f = ''; rows.push(row); row = [];
      } else f += ch;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows.filter(function (r) { return r.length > 1 || (r[0] && r[0].trim()); });
  }
  function csvField(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
  function ledgerToCSV(rows) {
    return ['project,title,uuid,updated_at,file,exported_at'].concat(rows.map(function (r) {
      return [r.project, r.title, r.uuid, r.updated_at, r.file, r.exported_at].map(csvField).join(',');
    })).join('\n');
  }
  function ledgerToJSON(rows) { return JSON.stringify({ app: 'claude-transfer', version: 1, rows: rows }, null, 1); }
  // Reads either the new ledger.json or an older ledger.csv.
  function parseLedger(text) {
    var t = String(text || '').replace(/^﻿/, '').trim(), rows;
    if (!t) return [];
    if (t.charAt(0) === '{' || t.charAt(0) === '[') {
      var d = JSON.parse(t);
      rows = Array.isArray(d) ? d : (d.rows || []);
    } else {
      var grid = parseCSV(t), head = grid[0].map(function (h) { return h.trim().toLowerCase(); });
      var cols = ['project', 'title', 'uuid', 'updated_at', 'file', 'exported_at'];
      var hasHead = head.indexOf('uuid') >= 0;
      var pos = {};
      cols.forEach(function (c, i) { pos[c] = hasHead ? head.indexOf(c) : i; });
      rows = grid.slice(hasHead ? 1 : 0).map(function (r) {
        var o = {};
        cols.forEach(function (c) { o[c] = pos[c] >= 0 ? (r[pos[c]] || '') : ''; });
        return o;
      });
    }
    return rows.filter(function (r) { return r && r.uuid && r.updated_at; }).map(function (r) {
      return { project: r.project || '', title: r.title || '', uuid: String(r.uuid), updated_at: String(r.updated_at), file: r.file || '', exported_at: r.exported_at || '' };
    });
  }
  function mergeLedger(prev, added) {
    var map = {}, order = [];
    (prev || []).concat(added || []).forEach(function (r) {
      var k = ledgerKey(r);
      if (!map[k]) order.push(k);
      map[k] = r;
    });
    return order.map(function (k) { return map[k]; });
  }

  /* ---------- cross-project checks ---------- */

  function findOverlaps(selections) {
    var seen = {}, out = [];
    selections.forEach(function (s) {
      s.chats.forEach(function (c) { (seen[c.uuid] = seen[c.uuid] || { chat: c, projects: [] }).projects.push(s.project); });
    });
    Object.keys(seen).forEach(function (k) { if (seen[k].projects.length > 1) out.push({ title: seen[k].chat.name, projects: seen[k].projects }); });
    return out;
  }
  function unassigned(convs, selections) {
    var used = {};
    selections.forEach(function (s) { s.chats.forEach(function (c) { used[c.uuid] = 1; }); });
    return convs.filter(function (c) { return !used[c.uuid]; });
  }

  /* ---------- prompt for the original account ---------- */

  var PROMPT_TEMPLATE = [
    "I'm moving my work to a new Claude account and need an exact list of the chats in this project, so I can match them to my data export.",
    '',
    "Use your past-chat search tools (recent chats and conversation search) to find every conversation in this project. Keep paging until nothing new turns up. Don't stop at the first batch.",
    '',
    'Reply with one code block in exactly this format:',
    '',
    '```',
    '# {PROJECT}',
    'Exact chat title',
    'Exact chat title',
    '```',
    '',
    'Rules:',
    '- The first line is #, a space, then the project name exactly as it appears in my sidebar.',
    "- One chat title per line, copied character for character. Don't shorten, correct, translate, number, bullet or quote any title.",
    '- No commentary inside the code block.',
    "- If you can't find or can't see some chats, don't guess and don't invent titles. After the code block, tell me in one line how many you listed and whether you think any are missing."
  ].join('\n');
  function buildPrompt(projectName) {
    return PROMPT_TEMPLATE.replace('{PROJECT}', projectName && projectName.trim() ? projectName.trim() : 'My project name');
  }

  return {
    norm: norm, key: key, safe: safe, safeFile: safeFile, uniqueName: uniqueName,
    makeIndex: makeIndex, find: find, suggest: suggest, parseLists: parseLists,
    normalizeProjects: normalizeProjects, isBlankProject: isBlankProject, matchProject: matchProject,
    projectLink: projectLink, chatLink: chatLink, projectFiles: projectFiles,
    DEFAULT_OPTS: DEFAULT_OPTS, messageBody: messageBody, attachmentsText: attachmentsText, formatMessage: formatMessage,
    splitText: splitText, buildParts: buildParts, transcriptFiles: transcriptFiles,
    ledgerKey: ledgerKey, parseCSV: parseCSV, ledgerToCSV: ledgerToCSV, ledgerToJSON: ledgerToJSON,
    parseLedger: parseLedger, mergeLedger: mergeLedger,
    findOverlaps: findOverlaps, unassigned: unassigned, buildPrompt: buildPrompt, PROMPT_TEMPLATE: PROMPT_TEMPLATE
  };
});
