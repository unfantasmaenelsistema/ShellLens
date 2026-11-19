// uso: node tests/dump.js "comando" [en]
const { createData } = require('../js/data.js');
const { createEngine } = require('../js/explain.js');
(async () => {
  const src = process.argv[2]; const lang = process.argv[3] || 'es';
  const eng = createEngine({ data: createData(), lang });
  const r = await eng.explain(src);
  if (r.error) { console.log('ERROR:', r.error); return; }
  function dumpUnit(u, ind) {
    console.log(ind + '▶ ' + (u.display || u.name || '(sin nombre)') + ' — ' + (u.summary || ''));
    for (const t of u.tokens) {
      console.log(ind + '  [' + t.role + '] ' + t.text);
      for (const it of t.items) console.log(ind + '      · ' + it.label + ': ' + (it.desc || '') + (it.en ? ' (EN)' : ''));
      for (const n of t.nested || []) dumpNested(n, ind + '      ');
    }
  }
  function dumpNested(n, ind) {
    console.log(ind + '⤷ ' + n.label + (n.error ? ' ERROR ' + n.error : ''));
    if (n.tree) dumpTree(n.tree, ind + '   ');
  }
  function dumpTree(t, ind) {
    if (!t) return;
    switch (t.kind) {
      case 'cmd': dumpUnit(t.unit, ind); break;
      case 'pipe': t.stages.forEach((s, i) => { console.log(ind + '| etapa ' + (i + 1)); dumpTree(s, ind + '  '); }); break;
      case 'andor': t.seq.forEach(s => { if (s.op) console.log(ind + s.op); dumpTree(s.node, ind); }); break;
      case 'seq': t.items.forEach(s => dumpTree(s.node, ind)); break;
      default: console.log(ind + '<' + t.kind + '>'); for (const k of ['body', 'else']) if (t[k]) dumpTree(t[k], ind + '  '); if (t.branches) t.branches.forEach(b => { dumpTree(b.cond, ind + '  '); dumpTree(b.body, ind + '  '); }); if (t.cond) dumpTree(t.cond, ind + '  ');
    }
  }
  dumpTree(r.tree, '');
  console.log('RIESGOS:', r.risks.map(x => x.level + ':' + x.id).join(', ') || '(ninguno)');
  console.log('EFECTOS:', r.effects.join(','));
})().catch(e => { console.error(e); process.exit(1); });
