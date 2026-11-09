/* Claude Transfer: page logic. Everything here runs in the browser; the only network calls are
   the optional ledger sync to your own Google Apps Script. */
(function () {
  'use strict';
  var CT = window.CT;
  var $ = function (i) { return document.getElementById(i); };
  var BIG = 150 * 1048576;           // warn above this file size
  var BULLET = /^([-*•]|\d+[.)])\s*/;

  var idx = null, convs = null;      // chat index and chat list
  var projects = [], showBlank = false, pchk = {};
  var pmap = {}, off = {}, opn = {}; // heading -> export project, unticked chats, open blocks
  var ledRows = [], led = {};        // ledger loaded from a file or the Sheet
  var saved = [], sent = {};         // rows saved this session, rows already sent to the Sheet
  var built = [];                    // results of the last build

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; }
  function tick() { return new Promise(function (r) { setTimeout(r, 30); }); }
  function mb(n) { return (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + ' MB'; }
  function pname(p) { return p.name || '(Untitled project)'; }
  function readText(f) {
    if (f.text) return f.text();
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; r.readAsText(f); });
  }
  function known() { return idx ? function (t) { return CT.find(idx, t).length > 0; } : null; }

  /* ---------- reading files ---------- */

  async function readValues(files) {
    var vals = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i], nm = (f.name || '').toLowerCase();
      if (/\.zip$/.test(nm) || f.type === 'application/zip') {
        var z = await JSZip.loadAsync(f);
        var names = Object.keys(z.files).filter(function (n) { return !z.files[n].dir && /\.json$/i.test(n) && n.indexOf('__MACOSX') < 0; });
        for (var j = 0; j < names.length; j++) vals.push(JSON.parse(await z.files[names[j]].async('string')));
      } else {
        vals.push(JSON.parse(await readText(f)));
      }
    }
    return vals;
  }
  function chatsFrom(vals) {
    var out = [], seen = {};
    function add(c) { if (c && Array.isArray(c.chat_messages) && !seen[c.uuid || out.length]) { seen[c.uuid || out.length] = 1; out.push(c); } }
    vals.forEach(function (v) { if (Array.isArray(v)) v.forEach(add); else add(v); });
    return out;
  }

  $('f').onchange = async function (e) {
    var files = [].slice.call(e.target.files); if (!files.length) return;
    var size = files.reduce(function (s, f) { return s + f.size; }, 0);
    $('big').hidden = size <= BIG;
    if (size > BIG) $('big').textContent = 'This file is ' + mb(size) + '. Phones can run out of memory on files this big. If the page stops responding, reload and try on a computer.';
    $('fs').textContent = 'Reading ' + mb(size) + '...';
    await tick();
    try {
      var list = chatsFrom(await readValues(files));
      if (!list.length) { $('fs').textContent = 'No chats found in that file. Pick conversations.json from your export.'; return; }
      convs = list; idx = CT.makeIndex(convs);
      $('fs').textContent = convs.length + ' chats loaded (' + mb(size) + ').';
      $('go').disabled = false; preview();
    } catch (x) {
      $('fs').textContent = 'Could not read the file: ' + x.message + (size > BIG ? '. A file this large may not fit in this device\'s memory. Try again on a computer.' : '');
    }
  };

  $('pf').onchange = async function (e) {
    var files = [].slice.call(e.target.files); if (!files.length) return;
    $('pfs').textContent = 'Reading...';
    try {
      projects = CT.normalizeProjects(await readValues(files));
      if (!projects.length) { $('pfs').textContent = 'No projects found in that file. Pick projects.json (or the projects zip) from your export.'; return; }
      pmap = {}; pchk = {};
      var hidden = projects.filter(CT.isBlankProject).length;
      $('pfs').textContent = (projects.length - hidden) + ' projects loaded' + (hidden ? ' (' + hidden + ' empty placeholder' + (hidden > 1 ? 's' : '') + ' hidden)' : '') + '.';
      fillProjectSelect(); preview();
    } catch (x) { $('pfs').textContent = 'Could not read the file: ' + x.message; }
  };

  $('lf').onchange = async function (e) {
    var f = e.target.files[0]; if (!f) return;
    try {
      ledRows = CT.mergeLedger(ledRows, CT.parseLedger(await readText(f)));
      led = {}; ledRows.forEach(function (r) { led[CT.ledgerKey(r)] = 1; });
      $('skip').checked = true;
      $('lfs').textContent = 'Loaded ' + ledRows.length + ' ledger rows.';
      renderLedger();
    } catch (x) { $('lfs').textContent = 'Could not read that ledger: ' + x.message; }
  };

  /* ---------- prompt for the original account ---------- */

  function visibleProjects() { return projects.filter(function (p) { return showBlank || !CT.isBlankProject(p); }); }
  function fillProjectSelect() {
    var s = $('psel'); s.innerHTML = '';
    var o0 = el('option', '', 'Any project (type its name below)'); o0.value = ''; s.appendChild(o0);
    visibleProjects().forEach(function (p) { var o = el('option', '', pname(p)); o.value = String(projects.indexOf(p)); s.appendChild(o); });
    s.onchange();
  }
  $('psel').onchange = function () {
    var p = this.value === '' ? null : projects[+this.value];
    $('pr').value = CT.buildPrompt(p ? p.name : '');
    $('op').disabled = !(p && CT.projectLink(p.uuid));
  };
  $('cp').onclick = async function () {
    var ta = $('pr'), done = false;
    try { await navigator.clipboard.writeText(ta.value); done = true; }
    catch (x) { try { ta.focus(); ta.select(); ta.setSelectionRange(0, 999999); done = document.execCommand('copy'); } catch (y) { /* fall through */ } }
    $('cps').textContent = done ? 'Copied. Open the project, start a new chat in it, and paste.' : 'Could not copy automatically. Select the text and copy it by hand.';
  };
  $('op').onclick = function () {
    var p = $('psel').value === '' ? null : projects[+$('psel').value], url = p && CT.projectLink(p.uuid);
    if (url) window.open(url, '_blank', 'noopener');
  };

  /* ---------- project lists ---------- */

  function sel_(p) { return p.titles.filter(function (t) { return !off[p.name + '|' + CT.key(t)] && (!idx || CT.find(idx, t).length); }); }
  function headTxt(p) {
    var m = idx ? p.titles.filter(function (t) { return !CT.find(idx, t).length; }).length : 0;
    return sel_(p).length + ' of ' + p.titles.length + ' selected' + (idx && m ? ', ' + m + ' not found' : '');
  }
  function mkSummary(name, sub) {
    var sm = el('summary'), w = el('div', 'nm', name), sb = el('small', '', sub);
    w.appendChild(sb); sm.appendChild(w); sm.appendChild(el('span', 'tg'));
    return { sm: sm, sub: sb };
  }
  function replaceTitle(oldT, newT) {
    var lines = $('t').value.split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].trim().replace(BULLET, '') === oldT) { lines[i] = lines[i].replace(oldT, newT); break; }
    }
    $('t').value = lines.join('\n'); preview();
  }
  function exportProject(p) { var v = pmap[p.name]; return v ? projects[+v] : null; }
  function includes(pr) {
    var f = CT.projectFiles(pr), docs = f.filter(function (x) { return /^knowledge\//.test(x.path); }).length, bits = [];
    if (f.some(function (x) { return x.path === 'instructions.md'; })) bits.push('instructions');
    if (f.some(function (x) { return x.path === 'description.md'; })) bits.push('description');
    if (docs) bits.push(docs + ' document' + (docs > 1 ? 's' : ''));
    return bits.length ? bits.join(', ') : 'no instructions or documents';
  }

  function preview() {
    var lists = CT.parseLists($('t').value, known());
    var box = $('prev'); box.innerHTML = '';
    if (lists.length) {
      var ea = el('button', 'sm', 'Expand all'), ca = el('button', 'sm', 'Collapse all');
      ea.onclick = function () { box.querySelectorAll('details').forEach(function (d) { d.open = true; }); };
      ca.onclick = function () { box.querySelectorAll('details').forEach(function (d) { d.open = false; }); };
      box.appendChild(ea); box.appendChild(ca);
    }
    lists.forEach(function (p, i) {
      if (projects.length && !(p.name in pmap)) {
        var m = CT.matchProject(visibleProjects(), p.name);
        pmap[p.name] = m ? String(projects.indexOf(m)) : '';
      }
      var d = el('details', 'blk' + (i % 2 ? ' alt' : '')); d.open = !!opn[p.name];
      d.ontoggle = function () { opn[p.name] = d.open; };
      var h = mkSummary(p.name, headTxt(p)); d.appendChild(h.sm);

      if (projects.length) {
        d.appendChild(el('div', 'lbl', 'Project files from your export (instructions and documents):'));
        var sl = document.createElement('select'), none = el('option', '', 'None: transcripts only'); none.value = ''; sl.appendChild(none);
        visibleProjects().forEach(function (pr) { var o = el('option', '', pname(pr)); o.value = String(projects.indexOf(pr)); sl.appendChild(o); });
        sl.value = pmap[p.name] || '';
        var info = el('div', 'lbl', '');
        var link = el('a', 'lnk', 'Open this project in Claude'); link.target = '_blank'; link.rel = 'noopener';
        var showInfo = function () {
          var pr = exportProject(p); info.textContent = pr ? 'Will include: ' + includes(pr) + '.' : 'No project files will be bundled.';
          var url = pr ? CT.projectLink(pr.uuid) : ''; link.hidden = !url; if (url) link.href = url;
        };
        sl.onchange = function () { pmap[p.name] = sl.value; showInfo(); renderProjects(); };
        showInfo(); d.appendChild(sl); d.appendChild(info);
        var lw = el('div', 'lbl'); lw.appendChild(link); d.appendChild(lw);
      }

      var bar = el('div', 'bar'), ul = el('ul', 'chk');
      var all = el('button', 'sm', 'Select all'), none2 = el('button', 'sm', 'None');
      function setAll(v) { p.titles.forEach(function (t) { off[p.name + '|' + CT.key(t)] = !v; }); ul.querySelectorAll('input:not(:disabled)').forEach(function (c) { c.checked = v; }); h.sub.textContent = headTxt(p); }
      all.onclick = function () { setAll(true); }; none2.onclick = function () { setAll(false); };
      bar.appendChild(all); bar.appendChild(none2); d.appendChild(bar);
      p.titles.forEach(function (t) {
        var bad = idx && !CT.find(idx, t).length, li = el('li', bad ? 'bad' : ''), lb = el('label'), cb = document.createElement('input');
        cb.type = 'checkbox'; cb.checked = !off[p.name + '|' + CT.key(t)] && !bad; cb.disabled = !!bad;
        cb.onchange = function () { off[p.name + '|' + CT.key(t)] = !cb.checked; h.sub.textContent = headTxt(p); };
        lb.appendChild(cb); lb.appendChild(el('span', '', (bad ? 'Not found: ' : '') + t)); li.appendChild(lb);
        if (bad) {
          var s = CT.suggest(idx, t, 1, 0.5)[0];
          if (s) {
            var sg = el('span', 'sug'); sg.appendChild(document.createTextNode('Closest: ' + s.title + ' '));
            var use = el('button', '', 'Use this'); use.type = 'button'; use.onclick = function () { replaceTitle(t, s.title); };
            sg.appendChild(use); li.appendChild(sg);
          }
        }
        ul.appendChild(li);
      });
      d.appendChild(ul); box.appendChild(d);
    });
    renderProjects(lists);
  }
  $('t').oninput = preview;

  // The "Projects found in your export" list, with checkboxes to add headings for the ones you haven't listed.
  var lastLists = [];
  function renderProjects(lists) {
    if (lists) lastLists = lists;
    var box = $('pbox'); box.hidden = !projects.length; if (!projects.length) return;
    var vis = visibleProjects(), hidden = projects.length - projects.filter(function (p) { return !CT.isBlankProject(p); }).length;
    var listed = {};
    lastLists.forEach(function (l) { var v = pmap[l.name]; if (v) listed[v] = 1; });
    $('pcount').textContent = vis.length + ' project' + (vis.length === 1 ? '' : 's') + ' shown. Check any you want to add to your lists, for example projects with documents but no chats.';
    var pl = $('plist'); pl.innerHTML = '';
    vis.forEach(function (p) {
      var key = String(projects.indexOf(p)), lb = el('label'), cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = !!pchk[key]; cb.disabled = !!listed[key];
      cb.onchange = function () { pchk[key] = cb.checked; };
      var sp = el('span'); sp.appendChild(document.createTextNode(pname(p)));
      var docs = p.docs.filter(function (d) { return d.filename || String(d.content).trim(); }).length;
      sp.appendChild(el('small', '', (listed[key] ? 'In your lists. ' : '') + docs + ' document' + (docs === 1 ? '' : 's') + (String(p.instructions).trim() ? ', has instructions' : '')));
      lb.appendChild(cb); lb.appendChild(sp); pl.appendChild(lb);
    });
    var pb = $('pblank'); pb.hidden = !hidden; pb.textContent = (showBlank ? 'Hide ' : 'Show ') + hidden + ' empty placeholder' + (hidden > 1 ? 's' : '');
  }
  $('pblank').onclick = function () { showBlank = !showBlank; fillProjectSelect(); preview(); };
  $('padd').onclick = function () {
    var add = visibleProjects().filter(function (p) { return pchk[String(projects.indexOf(p))]; });
    if (!add.length) return;
    var t = $('t').value.replace(/\s+$/, '');
    add.forEach(function (p) { t += (t ? '\n\n' : '') + '# ' + pname(p); pmap[pname(p)] = String(projects.indexOf(p)); pchk[String(projects.indexOf(p))] = false; });
    $('t').value = t + '\n'; preview();
  };

  /* ---------- saving ---------- */

  function download(blob, name) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 60000);
  }
  function zipOf(files, prefix) {
    var z = new JSZip();
    files.forEach(function (f) { z.file((prefix || '') + f.path, f.text); });
    return z;
  }
  async function projectBlob(b) {
    if (b.files.length === 1 && /^transcripts\//.test(b.files[0].path)) {
      return { blob: new Blob([b.files[0].text], { type: 'text/markdown' }), name: b.files[0].path.replace(/^transcripts\//, '') };
    }
    return { blob: await zipOf(b.files).generateAsync({ type: 'blob' }), name: CT.safeFile(b.name, 'Project') + '.zip' };
  }
  async function masterZip() {
    var z = new JSZip(), used = {};
    built.forEach(function (b) {
      if (!b.files.length) return;
      var root = CT.uniqueName(CT.safeFile(b.name, 'Project'), used) + '/';
      b.files.forEach(function (f) { z.file(root + f.path, f.text); });
    });
    return z;
  }
  function recordKey(r) { return CT.ledgerKey(r); }
  // The ledger only records a chat once its file has actually been saved.
  function markSaved(bs) {
    var now = new Date().toISOString();
    bs.forEach(function (b) {
      b.saved = true;
      b.rows.forEach(function (r) { var row = { project: r.project, title: r.title, uuid: r.uuid, updated_at: r.updated_at, file: r.file, exported_at: now }; saved = CT.mergeLedger(saved, [row]); led[recordKey(row)] = 1; });
      if (b.btn) b.btn.textContent = 'Saved. Tap to save again: ' + b.label;
    });
    renderLedger();
  }
  function unsent() { return saved.filter(function (r) { return !sent[recordKey(r)]; }); }
  function renderLedger() {
    var all = CT.mergeLedger(ledRows, saved);
    $('ls').textContent = saved.length || ledRows.length
      ? saved.length + ' chat' + (saved.length === 1 ? '' : 's') + ' recorded from files saved in this session' + (ledRows.length ? ', plus ' + ledRows.length + ' from the ledger you loaded' : '') + '.'
      : 'Nothing recorded yet. Chats are added to the ledger when you save their files.';
    $('sv').disabled = !all.length; $('ss').disabled = !unsent().length;
  }
  $('sv').onclick = function () { download(new Blob([CT.ledgerToJSON(CT.mergeLedger(ledRows, saved))], { type: 'application/json' }), 'ledger.json'); };

  $('sab').onclick = async function () {
    if (!built.length) return;
    var btn = this; btn.disabled = true;
    try {
      markSaved(built.filter(function (b) { return b.files.length; }));
      var z = await masterZip(); z.file('ledger.json', CT.ledgerToJSON(CT.mergeLedger(ledRows, saved)));
      download(await z.generateAsync({ type: 'blob' }), 'Claude_Transfer.zip');
    } catch (x) { $('st').textContent = 'Could not build the zip: ' + x.message; }
    btn.disabled = false;
  };
  $('shb').onclick = async function () {
    var btn = this; btn.disabled = true;
    try {
      var blob = await (await masterZip()).generateAsync({ type: 'blob' });
      var file = new File([blob], 'Claude_Transfer.zip', { type: 'application/zip' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Claude Transfer' });
        markSaved(built.filter(function (b) { return b.files.length; }));
      } else $('st').textContent = 'This browser cannot share files. Use "Save all as one zip".';
    } catch (x) { if (x && x.name !== 'AbortError') $('st').textContent = 'Could not share: ' + x.message; }
    btn.disabled = false;
  };
  if (!(navigator.share && navigator.canShare)) $('shb').hidden = true;

  /* ---------- build ---------- */

  $('go').onclick = async function () {
    var lists = CT.parseLists($('t').value, known());
    var out = $('out'); out.innerHTML = ''; built = []; $('sa').hidden = true;
    if (!lists.length) { $('st').textContent = 'Paste at least one project list.'; return; }
    $('go').disabled = true;
    var LIM = Math.max(5000, parseInt($('lim').value, 10) || 420000);
    var opts = { artifacts: $('o_art').checked, attachmentText: $('o_att').checked, tools: $('o_tool').checked, thinking: $('o_think').checked };
    var selections = [];
    try {
      for (var pi = 0; pi < lists.length; pi++) {
        var p = lists[pi];
        $('st').textContent = 'Working on project ' + (pi + 1) + ' of ' + lists.length + ': ' + p.name + '...';
        await tick();
        var blk = el('details', 'blk' + (pi % 2 ? ' alt' : '')), hh = mkSummary(p.name, 'Working...'); blk.appendChild(hh.sm);
        var ul = el('ul'), pick = {};
        sel_(p).forEach(function (t) {
          var ex = CT.find(idx, t);
          if (!ex.length) ul.appendChild(el('li', 'bad', 'Not found: ' + t));
          if (ex.length > 1) ul.appendChild(el('li', '', 'Shared title (' + ex.length + ' chats, all included): ' + t));
          ex.forEach(function (c) { pick[c.uuid] = c; });
        });
        var all = Object.keys(pick).map(function (k) { return pick[k]; }).sort(function (a, b) { return a.created_at < b.created_at ? -1 : 1; });
        selections.push({ project: p.name, chats: all });
        var list = all;
        if ($('skip').checked) {
          list = all.filter(function (c) { return !led[CT.ledgerKey({ project: p.name, uuid: c.uuid, updated_at: c.updated_at })]; });
          ul.appendChild(el('li', '', 'Skipped ' + (all.length - list.length) + ' already exported'));
        }
        var ep = exportProject(p), pfiles = ep ? CT.projectFiles(ep) : [], tf = [];
        if (list.length) tf = CT.transcriptFiles(p.name, CT.buildParts(list, LIM, opts));
        var files = pfiles.concat(tf.map(function (f) { return { path: 'transcripts/' + f.name, text: f.text }; })), rows = [], rowed = {};
        tf.forEach(function (f) {
          f.owners.forEach(function (c) { if (rowed[c.uuid]) return; rowed[c.uuid] = 1; rows.push({ project: p.name, title: c.name || '', uuid: c.uuid, updated_at: c.updated_at, file: f.name }); });
        });
        if (!files.length) { hh.sub.textContent = 'Nothing to export'; ul.appendChild(el('li', 'sum', 'Nothing to export')); blk.appendChild(ul); out.appendChild(blk); continue; }
        files.forEach(function (f) { ul.appendChild(el('li', '', f.path + '  (~' + Math.max(1, Math.round(f.text.length / 4000)) + 'K tokens)')); });
        var sum = list.length + ' chat' + (list.length === 1 ? '' : 's') + ', ' + tf.length + ' transcript part' + (tf.length === 1 ? '' : 's') + (pfiles.length ? ', ' + pfiles.length + ' project file' + (pfiles.length === 1 ? '' : 's') : '');
        ul.appendChild(el('li', 'sum', sum)); hh.sub.textContent = sum; blk.appendChild(ul);
        var b = { name: p.name, files: files, rows: rows, label: '' };
        var single = files.length === 1 && /^transcripts\//.test(files[0].path);
        b.label = single ? files[0].path.replace(/^transcripts\//, '') : CT.safeFile(p.name, 'Project') + '.zip';
        var sb = el('button', 'save', 'Save ' + b.label); b.btn = sb;
        sb.onclick = (function (bb) { return async function () { var r = await projectBlob(bb); download(r.blob, r.name); markSaved([bb]); }; })(b);
        blk.appendChild(sb); out.appendChild(blk); built.push(b);
        blk.scrollIntoView({ block: 'nearest' });
        await tick();
      }
      // Warnings that need a look before moving on.
      var ov = CT.findOverlaps(selections), un = CT.unassigned(convs, selections);
      if (ov.length) {
        var wb = el('details', 'blk'); wb.appendChild(mkSummary('Chats in more than one project', ov.length + ' chat' + (ov.length > 1 ? 's' : '')).sm);
        var wl = el('ul'); ov.forEach(function (o) { wl.appendChild(el('li', '', o.title + ': ' + o.projects.join(', '))); }); wb.appendChild(wl); out.appendChild(wb);
      }
      if (un.length) {
        var ub = el('details', 'blk alt'); ub.appendChild(mkSummary('Chats not in any project list', un.length + ' of ' + convs.length + ' chats. These are either unassigned or missing from your lists.').sm);
        var ulx = el('ul');
        un.slice().sort(function (a, b) { return a.updated_at < b.updated_at ? 1 : -1; }).slice(0, 300).forEach(function (c) { ulx.appendChild(el('li', '', (c.name || '(untitled)') + '  ·  ' + (c.updated_at || '').slice(0, 10))); });
        if (un.length > 300) ulx.appendChild(el('li', 'sum', 'and ' + (un.length - 300) + ' more'));
        ub.appendChild(ulx); out.appendChild(ub);
      }
      $('st').textContent = 'Done. ' + built.length + ' project' + (built.length === 1 ? '' : 's') + ' ready to save.' + (ov.length ? ' ' + ov.length + ' chat(s) appear in more than one project.' : '');
      $('sa').hidden = !built.length;
    } catch (x) {
      $('st').textContent = 'Something went wrong: ' + x.message;
    }
    $('go').disabled = false;
  };

  /* ---------- Google Sheet sync ---------- */

  try { $('su').value = localStorage.getItem('ce_url') || ''; $('sk').value = localStorage.getItem('ce_key') || ''; } catch (x) { /* storage may be blocked */ }
  function creds() {
    var u = $('su').value.trim(), k = $('sk').value.trim();
    try { localStorage.setItem('ce_url', u); localStorage.setItem('ce_key', k); } catch (x) { /* ignore */ }
    return { u: u, k: k };
  }
  async function sheetPost(body) {
    var c = creds();
    if (!c.u || !c.k) throw new Error('Enter the URL and key first.');
    if (!/^https:\/\/script\.google\.com\//.test(c.u)) throw new Error('That does not look like an Apps Script URL. It should start with https://script.google.com/');
    // The key travels in the message body, never in the web address.
    var r = await fetch(c.u, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(Object.assign({ key: c.k }, body)) });
    var txt = await r.text(), d;
    try { d = JSON.parse(txt); } catch (x) { throw new Error("The Sheet didn't answer with data. Check the URL, and that access is set to Anyone."); }
    if (d.error) throw new Error('Sheet said: ' + d.error);
    return d;
  }
  $('sl').onclick = async function () {
    $('sst').textContent = 'Loading...';
    try {
      var d = await sheetPost({ action: 'list' }), rows = d.rows || [];
      if (rows.length && rows[0].project === undefined) { $('sst').textContent = 'Your Apps Script is the old version. Replace it with the script from this app and deploy it again.'; return; }
      ledRows = CT.mergeLedger(ledRows, rows.map(function (r) { return { project: r.project || '', title: r.title || '', uuid: String(r.uuid), updated_at: String(r.updated_at), file: r.file || '', exported_at: '' }; }));
      led = {}; ledRows.forEach(function (r) { led[CT.ledgerKey(r)] = 1; });
      $('skip').checked = true; $('sst').textContent = 'Loaded ' + rows.length + ' ledger rows from the Sheet.'; renderLedger();
    } catch (x) { $('sst').textContent = x.message; }
  };
  $('ss').onclick = async function () {
    var todo = unsent(); if (!todo.length) return;
    $('ss').disabled = true; var added = 0, skipped = 0;
    try {
      for (var i = 0; i < todo.length; i += 500) {
        var chunk = todo.slice(i, i + 500);
        $('sst').textContent = 'Sending ' + Math.min(i + 500, todo.length) + ' of ' + todo.length + '...';
        var d = await sheetPost({ action: 'add', rows: chunk });
        chunk.forEach(function (r) { sent[recordKey(r)] = 1; });
        added += d.added || 0; skipped += d.skipped || 0;
      }
      $('sst').textContent = 'Added ' + added + ' rows to the Sheet' + (skipped ? ' (' + skipped + ' were already there)' : '') + '.';
    } catch (x) { $('sst').textContent = x.message + ' Sending again is safe: rows already in the Sheet are skipped.'; }
    renderLedger();
  };
  $('sc').onclick = function () {
    try { localStorage.removeItem('ce_url'); localStorage.removeItem('ce_key'); } catch (x) { /* ignore */ }
    $('su').value = ''; $('sk').value = ''; $('sst').textContent = 'Cleared from this device.';
  };

  /* ---------- start ---------- */

  $('pr').value = CT.buildPrompt('');
  renderLedger();
  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(function () { /* offline use is a bonus */ });
})();
