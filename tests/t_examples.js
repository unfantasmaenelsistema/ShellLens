// Todos los ejemplos de la web deben analizarse sin error; los «peligrosos» deben avisar.
const { createData } = require('../js/data.js');
const { createEngine } = require('../js/explain.js');
const { groups } = require('../js/examples.js');
(async () => {
  const eng = createEngine({ data: createData(), lang: 'es' });
  let fail = 0, n = 0;
  for (const g of groups) for (const e of g.items) {
    n++;
    let r;
    try { r = await eng.explain(e.c); } catch (x) { console.log('EXCEPCIÓN', e.c, x.message); fail++; continue; }
    if (r.error) { console.log('ERROR de sintaxis:', e.c, r.error); fail++; continue; }
    const unk = r.units.filter(u => u.unknown && !u.local).map(u => u.name);
    const worst = r.risks[0] ? r.risks[0].level : 'ok';
    const tag = g.danger ? (['crit', 'high', 'med'].includes(worst) ? 'ok ' : 'SIN AVISO') : '   ';
    if (g.danger && !['crit', 'high', 'med'].includes(worst)) fail++;
    if (unk.length) { console.log('desconocidos en', e.c, unk); }
    console.log(tag, worst.padEnd(5), r.risks.map(x => x.id).join(','), '←', e.c.slice(0, 70));
  }
  console.log(fail ? fail + ' problemas' : `ejemplos OK (${n})`);
  process.exit(fail ? 1 : 0);
})();
