// Run with: node tests/core.test.js
const assert = require('assert');
const CT = require('../core.js');

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('ok  ' + name); }

const chat = (name, id, msgs, extra) => Object.assign({
  uuid: id, name, created_at: '2026-01-01T10:00:00Z', updated_at: '2026-01-02T10:00:00Z',
  chat_messages: msgs || []
}, extra || {});
const msg = (sender, text, extra) => Object.assign({ sender, text, created_at: '2026-01-01T10:00:00Z' }, extra || {});

test('norm keeps accents and non-English letters', () => {
  assert.strictEqual(CT.norm('Café résumé!'), 'café résumé');
  assert.strictEqual(CT.norm('日本語の計画'), '日本語の計画');
  assert.notStrictEqual(CT.key('Plan Ñ'), CT.key('Plan Ü'));
});

test('symbol-only titles do not collapse into one key', () => {
  assert.notStrictEqual(CT.key('🔥🔥'), CT.key('🚀'));
  assert.notStrictEqual(CT.key('???'), CT.key('!!!'));
});

test('find matches loosely and handles the ellipsis prefix', () => {
  const idx = CT.makeIndex([chat('Evaluation meeting action items', 'a'), chat('Café menu', 'b'), chat('Café menu', 'c')]);
  assert.strictEqual(CT.find(idx, 'evaluation MEETING action items!').length, 1);
  assert.strictEqual(CT.find(idx, 'Evaluation meeting…').length, 1);
  assert.strictEqual(CT.find(idx, 'Cafe menu').length, 0, 'accent is significant');
  assert.strictEqual(CT.find(idx, 'Café menu').length, 2, 'duplicate titles both returned');
  assert.strictEqual(CT.find(idx, 'Nothing here').length, 0);
});

test('suggest offers the closest title for a near miss', () => {
  const idx = CT.makeIndex([chat('Toronto hospital research network', 'a'), chat('Grocery plan', 'b')]);
  const s = CT.suggest(idx, 'Toronto hospital research networks and more', 1, 0.4);
  assert.strictEqual(s[0].title, 'Toronto hospital research network');
  assert.deepStrictEqual(CT.suggest(idx, 'Completely unrelated words', 1, 0.5), []);
});

test('parseLists: headings, bullets, duplicates, code fences', () => {
  const txt = '```\n# GOL Evaluation\n- First chat\n2. Second chat\nFirst chat\n\n# Meeting Log\nThird chat\n```\nTotal 3 chats';
  const p = CT.parseLists(txt, null);
  assert.strictEqual(p.length, 2);
  assert.deepStrictEqual(p[0].titles, ['First chat', 'Second chat']);
  assert.strictEqual(p[1].name, 'Meeting Log');
  assert.ok(!p.some(x => x.name.indexOf('`') >= 0), 'fence lines are ignored');
});

test('parseLists: with # headings, a title before a blank line is still just a title', () => {
  const p = CT.parseLists('# A\nOne\nTwo\n\n# B\nThree\n\nFour', null);
  assert.deepStrictEqual(p.map(x => x.name), ['A', 'B']);
  assert.deepStrictEqual(p[0].titles, ['One', 'Two']);
  assert.deepStrictEqual(p[1].titles, ['Three', 'Four']);
});

test('parseLists: plain lists without # still split on blank-line headings', () => {
  const known = { 'Chat one': 1, 'Chat two': 1 };
  const p = CT.parseLists('Project X\n\nChat one\n\nProject Y\n\nChat two', t => !!known[t]);
  assert.deepStrictEqual(p.map(x => x.name), ['Project X', 'Project Y']);
  assert.deepStrictEqual(p[1].titles, ['Chat two']);
});

test('parseLists: a fenced reply plus a typed list below it both count', () => {
  const p = CT.parseLists('```\n# A\nOne\n```\nI listed 1 chat.\n\n# B\nTwo\nThree', null);
  assert.deepStrictEqual(p.map(x => x.name), ['A', 'B']);
  assert.deepStrictEqual(p[0].titles, ['One'], 'closing sentence ignored');
  assert.deepStrictEqual(p[1].titles, ['Two', 'Three']);
});

test('parseLists: titles before any heading go into a default project', () => {
  const p = CT.parseLists('One\nTwo', null);
  assert.strictEqual(p[0].name, 'Project');
  assert.strictEqual(p[0].titles.length, 2);
});

const projA = { uuid: '019cc786-7103-77d6-93da-cdb434d8b199', name: 'GOL Holidays', description: 'Holiday orders', prompt_template: 'Be brief.', docs: [{ filename: 'orders.md', content: 'x' }, { filename: 'orders.md', content: 'y' }, { filename: '', content: '' }] };
const blank = { uuid: '019d0d6c-00e5-7462-8329-f90aa17a28ae', name: '', description: '', prompt_template: '', docs: [{ filename: '', content: '' }] };
const named = { uuid: '019d673c-6fa3-7377-8ba8-74e4c880643c', name: 'Meeting Log Tool', description: '', prompt_template: '', docs: [] };

test('normalizeProjects accepts arrays, single objects, wrappers and ignores chats', () => {
  const ps = CT.normalizeProjects([[projA], blank, { projects: [named] }, chat('a chat', 'z'), projA]);
  assert.strictEqual(ps.length, 3, 'chat ignored, duplicate uuid removed');
});

test('blank placeholders are detected; named-but-empty projects are kept', () => {
  const ps = CT.normalizeProjects([projA, blank, named]);
  assert.deepStrictEqual(ps.map(CT.isBlankProject), [false, true, false]);
});

test('matchProject: exact, near, and none', () => {
  const ps = CT.normalizeProjects([projA, named]);
  assert.strictEqual(CT.matchProject(ps, 'gol holidays').name, 'GOL Holidays');
  assert.strictEqual(CT.matchProject(ps, 'GOL Holidays Project').name, 'GOL Holidays');
  assert.strictEqual(CT.matchProject(ps, 'Something else entirely'), null);
});

test('projectFiles: separate files, empty instructions omitted, duplicate names kept distinct', () => {
  const [p] = CT.normalizeProjects([projA]);
  const f = CT.projectFiles(p).map(x => x.path);
  assert.deepStrictEqual(f, ['instructions.md', 'description.md', 'knowledge/orders.md', 'knowledge/orders (2).md']);
  const [n] = CT.normalizeProjects([named]);
  assert.deepStrictEqual(CT.projectFiles(n), [], 'empty instructions and no docs: nothing, and no error');
});

test('links are only built from real ids', () => {
  assert.strictEqual(CT.projectLink(projA.uuid), 'https://claude.ai/project/' + projA.uuid);
  assert.strictEqual(CT.projectLink('nope'), '');
  assert.strictEqual(CT.chatLink(''), '');
});

test('fidelity: artifacts and attachment text kept by default, thinking and tools off', () => {
  const m = msg('assistant', 'Here you go', {
    content: [
      { type: 'thinking', thinking: 'secret reasoning' },
      { type: 'text', text: 'Here you go' },
      { type: 'tool_use', name: 'artifacts', input: { command: 'create', title: 'Plan', type: 'text/markdown', content: '# Plan\n```js\nx\n```' } },
      { type: 'tool_use', name: 'web_search', input: { query: 'q' } },
      { type: 'tool_result', name: 'web_search', content: [{ type: 'text', text: 'result text' }] }
    ],
    attachments: [{ file_name: 'brief.txt', extracted_content: 'ATTACHED WORDS' }],
    files: [{ file_name: 'pic.png' }]
  });
  const out = CT.formatMessage(m);
  assert.ok(out.includes('[Artifact: Plan (text/markdown)]'));
  assert.ok(out.includes('# Plan'));
  assert.ok(out.includes('ATTACHED WORDS'));
  assert.ok(out.includes('[Attachments: brief.txt, pic.png]'));
  assert.ok(!out.includes('secret reasoning'));
  assert.ok(!out.includes('web_search'));
  const all = CT.formatMessage(m, { artifacts: true, attachmentText: true, tools: true, thinking: true });
  assert.ok(all.includes('secret reasoning') && all.includes('web_search') && all.includes('result text'));
  const none = CT.formatMessage(m, { artifacts: false, attachmentText: false, tools: false, thinking: false });
  assert.ok(!none.includes('# Plan') && !none.includes('ATTACHED WORDS'));
  assert.ok(none.includes('Here you go'));
});

test('fidelity: nested code fences are fenced with a longer fence', () => {
  const m = msg('assistant', '', { content: [{ type: 'tool_use', name: 'artifacts', input: { command: 'create', title: 'T', content: 'a\n```\nb\n```' } }] });
  assert.ok(CT.formatMessage(m).includes('````'));
});

test('fidelity: plain text-only messages still work, text falls back when no text block', () => {
  assert.ok(CT.formatMessage(msg('human', 'hello')).includes('hello'));
  const m = msg('assistant', 'fallback text', { content: [{ type: 'tool_use', name: 'artifacts', input: { command: 'create', content: 'c' } }] });
  assert.ok(CT.formatMessage(m).includes('fallback text'));
});

test('splitText never exceeds the limit and loses nothing', () => {
  const big = ('para one line\nsecond line\n\n').repeat(500) + 'tail';
  const parts = CT.splitText(big, 1000);
  assert.ok(parts.every(p => p.length <= 1000));
  assert.strictEqual(parts.join(''), big);
  const emoji = '😀'.repeat(3000);
  const ep = CT.splitText(emoji, 999);
  assert.strictEqual(ep.join(''), emoji, 'surrogate pairs stay whole');
  assert.ok(ep.every(p => !/[\uD800-\uDBFF]$/.test(p)));
});

test('buildParts: every part within the limit, a giant message is split, nothing lost', () => {
  const giant = 'word '.repeat(60000); // 300k chars in one message
  const chats = [
    chat('Small one', 's1', [msg('human', 'hi'), msg('assistant', 'hello')]),
    chat('Giant message', 'g1', [msg('human', 'start'), msg('assistant', giant), msg('human', 'end marker')]),
    chat('Small two', 's2', [msg('human', 'second small')])
  ];
  const LIMIT = 50000;
  const parts = CT.buildParts(chats, LIMIT);
  const files = CT.transcriptFiles('Test Project', parts);
  files.forEach(f => assert.ok(f.text.length <= LIMIT, 'part ' + f.name + ' is ' + f.text.length));
  const joined = files.map(f => f.text).join('');
  assert.strictEqual((joined.match(/word/g) || []).length, 60000, 'every word survived the split');
  assert.ok(joined.includes('end marker') && joined.includes('second small'));
  assert.ok(files.every(f => f.text.length > 400), 'no near-empty parts');
  assert.ok(files[0].name.indexOf('_Part01') > 0);
  const owners = {};
  parts.forEach(p => p.owners.forEach(c => { owners[c.uuid] = 1; }));
  assert.deepStrictEqual(Object.keys(owners).sort(), ['g1', 's1', 's2']);
});

test('buildParts: single small export gives one Full_Chats file', () => {
  const parts = CT.buildParts([chat('A', 'a', [msg('human', 'x')])], 420000);
  const f = CT.transcriptFiles('Évaluation GOL', parts);
  assert.strictEqual(f.length, 1);
  assert.ok(/_Full_Chats\.md$/.test(f[0].name));
  assert.ok(f[0].name.indexOf('Évaluation') === 0, 'non-English project names keep their letters');
});

test('ledger: CSV round trip with quotes, commas and newlines', () => {
  const rows = [{ project: 'He said "hi", ok', title: 'Title, with "quotes"\nand a newline', uuid: 'u1', updated_at: '2026-01-02T10:00:00Z', file: 'f.md', exported_at: 'now' }];
  const back = CT.parseLedger(CT.ledgerToCSV(rows));
  assert.deepStrictEqual(back, rows);
});

test('ledger: JSON round trip and legacy 5-column CSV', () => {
  const rows = [{ project: 'P', title: 'T', uuid: 'u1', updated_at: 'd1', file: 'f', exported_at: '' }];
  assert.deepStrictEqual(CT.parseLedger(CT.ledgerToJSON(rows)), rows);
  const legacy = 'project,title,uuid,updated_at,file\n"P","T","u2","d2","f.md"';
  assert.strictEqual(CT.parseLedger(legacy)[0].uuid, 'u2');
});

test('ledger: merge dedupes by project + uuid + updated_at', () => {
  const a = { project: 'P', title: 'T', uuid: 'u1', updated_at: 'd1', file: 'old' };
  const merged = CT.mergeLedger([a], [Object.assign({}, a, { file: 'new' }), { project: 'Q', title: 'T', uuid: 'u1', updated_at: 'd1', file: 'x' }]);
  assert.strictEqual(merged.length, 2, 'same chat in a different project is its own row');
  assert.strictEqual(merged[0].file, 'new');
});

test('overlaps and unassigned chats', () => {
  const a = chat('A', 'a'), b = chat('B', 'b'), c = chat('C', 'c');
  const sel = [{ project: 'P1', chats: [a, b] }, { project: 'P2', chats: [b] }];
  const o = CT.findOverlaps(sel);
  assert.strictEqual(o.length, 1);
  assert.deepStrictEqual(o[0].projects, ['P1', 'P2']);
  assert.deepStrictEqual(CT.unassigned([a, b, c], sel).map(x => x.uuid), ['c']);
});

test('prompt fills in the project name and keeps the strict format', () => {
  const p = CT.buildPrompt('GOL Holidays');
  assert.ok(p.includes('# GOL Holidays'));
  assert.ok(!p.includes('{PROJECT}'));
  assert.ok(p.includes("don't guess"));
  assert.ok(CT.buildPrompt('').includes('# My project name'));
});

test('a pasted prompt reply parses straight back into a project list', () => {
  const reply = '```\n# GOL Holidays\nHoliday order form design\nVendor list cleanup\n```\nI listed 2 chats.';
  const p = CT.parseLists(reply, null);
  assert.strictEqual(p.length, 1);
  assert.strictEqual(p[0].name, 'GOL Holidays');
  assert.strictEqual(p[0].titles.length, 2);
});

console.log('\n' + passed + ' tests passed');
