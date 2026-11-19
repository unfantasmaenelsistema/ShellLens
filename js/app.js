/* CmdLens · interfaz */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('cl_' + k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('cl_' + k, v); } catch (e) { /* sin almacenamiento */ } },
  };

  const UI = {
    es: {
      skip: 'Ir al comando', tagline: 'Entiende el comando antes de ejecutarlo', tabExplain: 'Explicar', tabExamples: 'Ejemplos', tabCatalog: 'Catálogo', tabAbout: 'Acerca de',
      pasteLabel: 'Pega aquí el comando (puede tener tuberías, redirecciones, bucles…)', explainBtn: 'Explicar', clearBtn: 'Limpiar', linkBtn: 'Copiar enlace',
      privacy: '🔒 No se ejecuta nada y no se envía nada: todo se analiza en tu navegador.',
      footLeft: 'Hecho por <a href="https://www.unfantasmaenelsistema.com/" target="_blank" rel="noopener">Un Fantasma en el Sistema</a> · Tienda <a href="https://www.ghostore.unfantasmaenelsistema.com/" target="_blank" rel="noopener">GhoStore</a>',
      empty: 'Pega un comando y pulsa «Explicar», o prueba uno de los ejemplos.', analysed: 'Analizado en', cmdsWord: 'comandos', copied: 'Enlace copiado', copyFail: 'No se pudo copiar: copia la dirección del navegador.',
      parseErr: 'No se puede interpretar el comando', parseHint: 'Revisa comillas, paréntesis y llaves sin cerrar.', at: 'cerca de la posición',
      vOk: 'Sin alertas conocidas', vOkSub: 'Eso no significa que sea inofensivo: lee cada parte antes de ejecutarlo.', vLow: 'Atención', vLowSub: 'Hay detalles que conviene conocer.', vMed: 'Precaución', vMedSub: 'Puede tener efectos que no quieres.', vHigh: 'Peligroso', vHighSub: 'Puede causar pérdida de datos o abrir una brecha de seguridad.', vCrit: 'Crítico: no lo ejecutes', vCritSub: 'Puede destruir el sistema, ejecutar código ajeno o dar acceso a un atacante.',
      lvlLow: 'atención', lvlMed: 'precaución', lvlHigh: 'peligro', lvlCrit: 'crítico', saferWay: 'Más seguro',
      fxread: 'Lee archivos', fxwrite: 'Escribe archivos', fxdelete: 'Borra archivos', fxnet: 'Usa la red', fxpriv: 'Privilegios elevados', fxexec: 'Ejecuta otros programas', fxinstall: 'Instala software', fxsystem: 'Cambia el sistema',
      roleCmd: 'comando', roleSub: 'subcomando', roleOpt: 'opción', roleArg: 'valor', roleOperand: 'argumento', roleRedir: 'redirección', roleAssign: 'variable', roleOp: 'operador',
      pipeLink: 'la salida del comando de arriba entra como entrada del de abajo', andLink: 'solo si el anterior terminó bien (código 0)', orLink: 'solo si el anterior falló (código ≠ 0)', semiLink: 'a continuación, pase lo que pase', bgLink: 'el anterior se lanza en segundo plano (&) y no se espera',
      enTip: 'Descripción en inglés, tomada de la página man (todavía sin traducir)', curated: 'curado', manOnly: 'página man', unknownCmd: 'desconocido', tips: 'Consejo',
      ifT: 'Condicional «si»', ifCond: 'SI se cumple', ifThen: 'ENTONCES', ifElif: 'SI NO, SI', ifElse: 'SI NO', forT: 'Bucle «para cada»', forEach: 'Para cada valor de', forIn: 'en', forRun: 'repite', whileT: 'Bucle «mientras»', untilT: 'Bucle «hasta que»', whileCond: 'mientras se cumpla', untilCond: 'hasta que se cumpla', whileRun: 'repite', caseT: 'Selección «case»', caseOn: 'según el valor de', funcT: 'Definición de función', funcSub: 'No se ejecuta ahora: solo se define para llamarla después con su nombre.', subshellT: 'Subshell «( … )»', subshellSub: 'Se ejecuta en un proceso hijo: sus cambios de variables o de directorio no afectan a la shell actual.', braceT: 'Grupo «{ … }»', braceSub: 'Agrupa comandos en la shell actual (para redirigirlos juntos).', testT: 'Prueba «[[ … ]]»', arithT: 'Aritmética «(( … ))»', arithSub: 'Calcula la expresión; el resultado es «verdadero» si es distinto de cero.', negT: 'El «!» invierte el resultado: éxito ↔ fallo.', timeT: '«time» mide cuánto tarda toda la tubería.',
      examplesH: 'Ejemplos', examplesLead: 'Pulsa «Analizar» para verlos explicados. Los de la categoría roja son peligrosos: están aquí para aprender a reconocerlos, no para ejecutarlos.', analyse: 'Analizar',
      catH: 'Catálogo de comandos', catLead: 'Todo lo que CmdLens sabe, con sus opciones. Los marcados con ● tienen explicaciones revisadas en español.', catSearch: 'Buscar comando…', catFilter: 'Filtrar opciones…', catPick: 'Elige un comando de la lista.', catSyn: 'Sintaxis', catAlias: 'También se llama', catOpts: 'opciones', catNone: 'Sin resultados', catShown: 'Se muestran las primeras',
      aboutHtml: '', histH: 'Recientes', histClear: 'Borrar historial',
    },
    en: {
      skip: 'Skip to command', tagline: 'Understand the command before you run it', tabExplain: 'Explain', tabExamples: 'Examples', tabCatalog: 'Catalog', tabAbout: 'About',
      pasteLabel: 'Paste the command here (pipes, redirections, loops… welcome)', explainBtn: 'Explain', clearBtn: 'Clear', linkBtn: 'Copy link',
      privacy: '🔒 Nothing is executed and nothing is sent: everything is analysed in your browser.',
      footLeft: 'Made by <a href="https://www.unfantasmaenelsistema.com/" target="_blank" rel="noopener">Un Fantasma en el Sistema</a> · Shop <a href="https://www.ghostore.unfantasmaenelsistema.com/" target="_blank" rel="noopener">GhoStore</a>',
      empty: 'Paste a command and press "Explain", or try one of the examples.', analysed: 'Analysed in', cmdsWord: 'commands', copied: 'Link copied', copyFail: 'Could not copy: copy the browser address instead.',
      parseErr: 'The command cannot be parsed', parseHint: 'Check for unclosed quotes, parentheses or braces.', at: 'near position',
      vOk: 'No known warnings', vOkSub: 'That does not mean it is harmless: read every part before running it.', vLow: 'Heads-up', vLowSub: 'There are details worth knowing.', vMed: 'Caution', vMedSub: 'It may have effects you do not want.', vHigh: 'Dangerous', vHighSub: 'It can cause data loss or open a security hole.', vCrit: 'Critical: do not run it', vCritSub: 'It can destroy the system, run foreign code or give an attacker access.',
      lvlLow: 'heads-up', lvlMed: 'caution', lvlHigh: 'danger', lvlCrit: 'critical', saferWay: 'Safer way',
      fxread: 'Reads files', fxwrite: 'Writes files', fxdelete: 'Deletes files', fxnet: 'Uses the network', fxpriv: 'Elevated privileges', fxexec: 'Runs other programs', fxinstall: 'Installs software', fxsystem: 'Changes the system',
      roleCmd: 'command', roleSub: 'subcommand', roleOpt: 'option', roleArg: 'value', roleOperand: 'argument', roleRedir: 'redirection', roleAssign: 'variable', roleOp: 'operator',
      pipeLink: 'the output of the command above becomes the input of the one below', andLink: 'only if the previous one succeeded (status 0)', orLink: 'only if the previous one failed (status ≠ 0)', semiLink: 'next, no matter what', bgLink: 'the previous one is launched in the background (&) and not waited for',
      enTip: 'English description taken from the man page (not yet translated)', curated: 'curated', manOnly: 'man page', unknownCmd: 'unknown', tips: 'Tip',
      ifT: '"if" conditional', ifCond: 'IF this holds', ifThen: 'THEN', ifElif: 'ELSE IF', ifElse: 'ELSE', forT: '"for each" loop', forEach: 'For each value of', forIn: 'in', forRun: 'repeat', whileT: '"while" loop', untilT: '"until" loop', whileCond: 'while this holds', untilCond: 'until this holds', whileRun: 'repeat', caseT: '"case" selection', caseOn: 'depending on the value of', funcT: 'Function definition', funcSub: 'Not run now: it is only defined so it can be called later by name.', subshellT: 'Subshell "( … )"', subshellSub: 'Runs in a child process: its variable or directory changes do not affect the current shell.', braceT: 'Group "{ … }"', braceSub: 'Groups commands in the current shell (to redirect them together).', testT: 'Test "[[ … ]]"', arithT: 'Arithmetic "(( … ))"', arithSub: 'Computes the expression; the result is "true" when non-zero.', negT: 'The "!" inverts the result: success ↔ failure.', timeT: '"time" measures how long the whole pipeline takes.',
      examplesH: 'Examples', examplesLead: 'Press "Analyse" to see them explained. The red category is dangerous: it is here to learn to recognise it, not to run it.', analyse: 'Analyse',
      catH: 'Command catalog', catLead: 'Everything CmdLens knows, with its options. Entries marked ● have reviewed Spanish explanations.', catSearch: 'Search command…', catFilter: 'Filter options…', catPick: 'Pick a command from the list.', catSyn: 'Synopsis', catAlias: 'Also known as', catOpts: 'options', catNone: 'No results', catShown: 'Showing the first',
      aboutHtml: '', histH: 'Recent', histClear: 'Clear history',
    },
  };
  let lang = store.get('lang', (navigator.language || 'es').toLowerCase().startsWith('en') ? 'en' : 'es');
  if (lang !== 'en') lang = 'es';
  const t = (k) => UI[lang][k] || UI.es[k] || k;
  const T = (es, en) => (lang === 'en' ? en : es);

  const data = CmdData.createData('data/');
  const engine = CmdEngine.createEngine({ data, lang });
  let last = null, lastSrc = '';
  let uid = 0;

  /* ---------- ids de tokens ---------- */
  function collectUnits(node, acc) {
    acc = acc || [];
    if (!node) return acc;
    switch (node.kind) {
      case 'cmd': acc.push(node.unit); break;
      case 'pipe': node.stages.forEach(s => collectUnits(s, acc)); break;
      case 'andor': node.seq.forEach(s => collectUnits(s.node, acc)); break;
      case 'seq': node.items.forEach(s => collectUnits(s.node, acc)); break;
      case 'group': collectUnits(node.body, acc); acc.push({ tokens: node.redirToks || [] }); break;
      case 'if': node.branches.forEach(b => { collectUnits(b.cond, acc); collectUnits(b.body, acc); }); collectUnits(node.else, acc); acc.push({ tokens: node.redirToks || [] }); break;
      case 'for': collectUnits(node.body, acc); break;
      case 'while': collectUnits(node.cond, acc); collectUnits(node.body, acc); break;
      case 'case': node.clauses.forEach(c => collectUnits(c.body, acc)); break;
      case 'function': collectUnits(node.body, acc); break;
    }
    return acc;
  }
  function assignIds(units) { for (const u of units) for (const tk of u.tokens || []) if (!tk._id) tk._id = 'k' + (++uid); }

  const ROLE = { cmd: 'roleCmd', subcmd: 'roleSub', opt: 'roleOpt', optarg: 'roleArg', operand: 'roleOperand', redir: 'roleRedir', assign: 'roleAssign' };

  /* ---------- línea anotada ---------- */
  function annotated(src, units, slice) {
    const toks = [];
    for (const u of units) for (const tk of u.tokens || []) toks.push(tk);
    toks.sort((a, b) => a.start - b.start || b.end - a.end);
    let pos = 0, html = '';
    if (slice && toks.length) { pos = Math.min(...toks.map(x => x.start)); src = src.slice(0, Math.max(...toks.map(x => x.end))); }
    const gap = (s) => esc(s).replace(/(\|&amp;|\|\||&amp;&amp;|\||;;|;|&amp;|\(|\)|\{|\}|!)|\b(if|then|else|elif|fi|for|in|do|done|while|until|case|esac|function|select)\b/g, (m, o, k) => '<span class="op">' + m + '</span>');
    for (const tk of toks) {
      if (tk.start < pos || tk.end > src.length) continue;
      html += gap(src.slice(pos, tk.start));
      html += '<span class="tk tk-' + tk.role + (tk.unknown ? ' unk' : '') + '" data-k="' + tk._id + '">' + esc(src.slice(tk.start, tk.end)) + '</span>';
      pos = tk.end;
    }
    html += gap(src.slice(pos));
    return '<div class="anno">' + html + '</div>';
  }

  /* ---------- tarjetas ---------- */
  function itemHTML(it) {
    const long = (it.desc || '').length > 280;
    const en = it.en && lang === 'es' ? ' <span class="badge en" title="' + esc(t('enTip')) + '">EN</span>' : '';
    return '<p class="item' + (it.indent ? ' ind' : '') + (it.unknown ? ' unknown' : '') + '"><b>' + esc(it.label) + '</b><span class="d' + (long ? ' clamp' : '') + '">' + esc(it.desc || '') + '</span>' + en + (it.note ? '<span class="note">' + esc(it.note) + '</span>' : '') + '</p>';
  }

  function nestedHTML(n) {
    let h = '<div class="nest"><p class="nt">' + esc(n.label) + '</p>';
    if (n.error) h += '<p class="item"><b>⚠</b> ' + esc(t('parseErr')) + ': ' + esc(n.error) + '</p>';
    else if (n.tree) { const us = collectUnits(n.tree); assignIds(us); h += annotated(n.src, us, n.outer) + '<div class="tree">' + treeHTML(n.tree) + '</div>'; }
    return h + '</div>';
  }

  function rowHTML(tk) {
    if (tk.hidden) return '';
    const label = tk.text.length > 70 ? tk.text.slice(0, 67) + '…' : tk.text;
    let v = tk.items.filter(i => i.label || i.desc).map(itemHTML).join('');
    if (tk.nested) v += tk.nested.map(nestedHTML).join('');
    return '<div class="row" data-k="' + tk._id + '"><div class="k ' + tk.role + '">' + esc(label) + '<small>' + esc(t(ROLE[tk.role] || 'roleOperand')) + '</small></div><div class="v">' + v + '</div></div>';
  }

  function unitHTML(u) {
    if (!u.tokens || !u.tokens.length) return '';
    const unk = !!u.unknown || u.dynamic;
    const sumEn = u.rec && lang === 'es' && !u.rec.s.es;
    const badge = u.rec ? (u.rec.o && u.rec.o.some(o => o.es) || u.rec.s.es ? '<span class="badge">' + esc(t('curated')) + ' ●</span>' : '<span class="badge">' + esc(t('manOnly')) + '</span>') : '<span class="badge">' + esc(t('unknownCmd')) + '</span>';
    let hk = (u.tokens.find(x => x.role === 'cmd') || {})._id;
    let h = '<article class="card' + (unk ? ' unk' : '') + '"><header><h3' + (hk ? ' data-k="' + hk + '"' : '') + '>' + esc(u.display || u.name || '…') + '</h3><p>' + esc(u.summary || '') + (sumEn ? ' <span class="badge en" title="' + esc(t('enTip')) + '">EN</span>' : '') + '</p>' + badge + '</header><div class="rows">';
    for (const tk of u.tokens) { if (tk.role === 'cmd' && tk.items.length <= 1 && !tk.nested && !(tk.items[0] && tk.items[0].label !== u.name)) continue; h += rowHTML(tk); }
    h += '</div>';
    if (u.tips && u.tips.length) h += '<div class="tips"><b>' + esc(t('tips')) + ':</b> ' + u.tips.map(esc).join(' · ') + '</div>';
    return h + '</article>';
  }

  function link(op, txt) { return '<div class="link"><b>' + esc(op) + '</b><span>' + esc(txt) + '</span></div>'; }

  function treeHTML(n) {
    if (!n) return '';
    switch (n.kind) {
      case 'cmd': return unitHTML(n.unit);
      case 'pipe': {
        let h = '<div class="flow">';
        if (n.negate) h += '<div class="link"><b>!</b><span>' + esc(t('negT')) + '</span></div>';
        if (n.timed) h += '<div class="link"><b>time</b><span>' + esc(t('timeT')) + '</span></div>';
        n.stages.forEach((s, i) => { if (i) h += link(n.ops[i - 1], t('pipeLink')); h += treeHTML(s); });
        return h + '</div>';
      }
      case 'andor': {
        let h = '<div class="flow">';
        n.seq.forEach((s, i) => { if (i) h += link(s.op, s.op === '&&' ? t('andLink') : t('orLink')); h += treeHTML(s.node); });
        return h + '</div>';
      }
      case 'seq': {
        let h = '<div class="flow">';
        n.items.forEach((s, i) => { if (i) h += link(n.items[i - 1].op === '&' ? '&' : ';', n.items[i - 1].op === '&' ? t('bgLink') : t('semiLink')); h += treeHTML(s.node); });
        return h + '</div>';
      }
      case 'group': {
        const sub = n.group === 'subshell';
        return '<div class="compound"><p class="ct">' + esc(t(sub ? 'subshellT' : 'braceT')) + '</p><p class="lead" style="margin:0 0 6px;font-size:.88rem">' + esc(t(sub ? 'subshellSub' : 'braceSub')) + '</p><div class="tree">' + treeHTML(n.body) + '</div>' + redirRows(n.redirToks) + '</div>';
      }
      case 'if': {
        let h = '<div class="compound"><p class="ct">' + esc(t('ifT')) + '</p>';
        n.branches.forEach((b, i) => { h += '<p class="sec">' + esc(t(i ? 'ifElif' : 'ifCond')) + '</p><div class="tree">' + treeHTML(b.cond) + '</div><p class="sec">' + esc(t('ifThen')) + '</p><div class="tree">' + treeHTML(b.body) + '</div>'; });
        if (n.else) h += '<p class="sec">' + esc(t('ifElse')) + '</p><div class="tree">' + treeHTML(n.else) + '</div>';
        return h + redirRows(n.redirToks) + '</div>';
      }
      case 'for': {
        const items = n.items ? n.items.map(i => i.text).join(' ') : '';
        let h = '<div class="compound"><p class="ct">' + esc(t(n.loop === 'select' ? 'forT' : 'forT')) + ': ' + (n.arith ? '<code>((' + esc(n.arith) + '))</code>' : esc(t('forEach')) + ' <code>' + esc(n.varName) + '</code> ' + (n.items ? esc(t('forIn')) + ' <code>' + esc(items) + '</code>' : '')) + '</p>';
        if (n.items) { const ex = n.items.flatMap(i => i.extras || []); if (ex.length) h += ex.slice(0, 6).map(itemHTML).join(''); }
        h += '<p class="sec">' + esc(t('forRun')) + '</p><div class="tree">' + treeHTML(n.body) + '</div>';
        return h + redirRows(n.redirToks) + '</div>';
      }
      case 'while': {
        const un = n.loop === 'until';
        return '<div class="compound"><p class="ct">' + esc(t(un ? 'untilT' : 'whileT')) + '</p><p class="sec">' + esc(t(un ? 'untilCond' : 'whileCond')) + '</p><div class="tree">' + treeHTML(n.cond) + '</div><p class="sec">' + esc(t('whileRun')) + '</p><div class="tree">' + treeHTML(n.body) + '</div>' + redirRows(n.redirToks) + '</div>';
      }
      case 'case': {
        let h = '<div class="compound"><p class="ct">' + esc(t('caseT')) + ': ' + esc(t('caseOn')) + ' <code>' + esc(n.subject) + '</code></p>';
        n.clauses.forEach(c => { h += '<p class="sec"><code>' + esc(c.pats.join(' | ')) + ')</code></p><div class="tree">' + treeHTML(c.body) + '</div>'; });
        return h + '</div>';
      }
      case 'function': return '<div class="compound"><p class="ct">' + esc(t('funcT')) + ': <code>' + esc(n.name) + '()</code></p><p class="lead" style="margin:0 0 6px;font-size:.88rem">' + esc(t('funcSub')) + '</p><div class="tree">' + treeHTML(n.body) + '</div></div>';
      case 'test': return '<div class="compound"><p class="ct">' + esc(t('testT')) + '</p><p class="item"><b>' + esc(n.text) + '</b></p></div>';
      case 'arith': return '<div class="compound"><p class="ct">' + esc(t('arithT')) + '</p><p class="item"><b>' + esc(n.expr.trim()) + '</b><span class="d">' + esc(t('arithSub')) + '</span></p></div>';
    }
    return '';
  }
  function redirRows(toks) { return toks && toks.length ? '<div class="rows card" style="margin-top:8px">' + toks.map(rowHTML).join('') + '</div>' : ''; }

  /* ---------- veredicto ---------- */
  function verdictHTML(r) {
    const lvl = r.risks.length ? r.risks[0].level : 'ok';
    const map = { ok: ['vOk', 'vOkSub'], low: ['vLow', 'vLowSub'], med: ['vMed', 'vMedSub'], high: ['vHigh', 'vHighSub'], crit: ['vCrit', 'vCritSub'] };
    const icon = { ok: '✅', low: 'ℹ️', med: '⚠️', high: '🔥', crit: '⛔' }[lvl];
    let h = '<section class="verdict ' + (lvl === 'ok' ? '' : lvl) + '"><h2>' + icon + ' ' + esc(t(map[lvl][0])) + '</h2><p class="sub">' + esc(t(map[lvl][1])) + '</p>';
    if (r.effects.length) h += '<div class="fx">' + r.effects.map(e => '<span>' + esc(t('fx' + e) !== 'fx' + e ? t('fx' + e) : e) + '</span>').join('') + '</div>';
    if (r.risks.length) {
      h += '<div class="risks">' + r.risks.map(k => '<div class="risk ' + k.level + '"><h3><span class="lv ' + k.level + '">' + esc(t('lvl' + k.level[0].toUpperCase() + k.level.slice(1))) + '</span>' + esc(k.title) + '</h3><p>' + esc(k.text) + '</p>' + (k.fix ? '<p class="fix">✔ <b>' + esc(t('saferWay')) + ':</b> ' + esc(k.fix) + '</p>' : '') + '</div>').join('') + '</div>';
    }
    return h + '</section>';
  }

  /* ---------- ejecución ---------- */
  let runToken = 0;
  async function run(src, opts) {
    opts = opts || {};
    src = src.replace(/\r\n/g, '\n');
    const out = $('#out');
    const my = ++runToken;
    if (!src.trim()) { out.innerHTML = '<p class="lead">' + esc(t('empty')) + '</p>'; $('#status').textContent = ''; last = null; return; }
    const t0 = performance.now();
    engine.setLang(lang);
    let r;
    try { r = await engine.explain(src); } catch (e) { console.error(e); out.innerHTML = '<div class="err"><h3>' + esc(t('parseErr')) + '</h3><p>' + esc(String(e && e.message || e)) + '</p></div>'; return; }
    if (my !== runToken) return;
    last = r; lastSrc = src;
    if (r.error) {
      let pos = '';
      if (typeof r.pos === 'number') pos = ' (' + t('at') + ' ' + r.pos + ')';
      out.innerHTML = '<div class="err"><h3>⚠ ' + esc(t('parseErr')) + '</h3><p>' + esc(r.error) + esc(pos) + '</p><p>' + esc(t('parseHint')) + '</p></div>';
      $('#status').textContent = '';
      return;
    }
    const us = collectUnits(r.tree); assignIds(us);
    out.innerHTML = verdictHTML(r) + annotated(src, us) + legend() + '<div class="tree">' + treeHTML(r.tree) + '</div>';
    const ms = Math.round(performance.now() - t0);
    $('#status').textContent = t('analysed') + ' ' + ms + ' ms · ' + r.units.filter(u => u.name).length + ' ' + t('cmdsWord');
    if (opts.save !== false) { addHistory(src); setHash(src); }
  }
  function legend() { return '<div class="legend"><span><i style="color:var(--cmd)">■</i> ' + esc(t('roleCmd')) + '</span><span><i style="color:var(--opt)">■</i> ' + esc(t('roleOpt')) + '</span><span><i style="color:var(--arg)">■</i> ' + esc(t('roleArg')) + '</span><span><i style="color:var(--operand)">■</i> ' + esc(t('roleOperand')) + '</span><span><i style="color:var(--redir)">■</i> ' + esc(t('roleRedir')) + '</span><span><i style="color:var(--assign)">■</i> ' + esc(t('roleAssign')) + '</span></div>'; }

  /* ---------- hash compartible ---------- */
  function b64e(s) { return btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function b64d(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return new TextDecoder().decode(Uint8Array.from(atob(s), c => c.charCodeAt(0))); }
  function setHash(src) { try { history.replaceState(null, '', '#c=' + b64e(src)); } catch (e) { /* ignorar */ } }
  function readHash() { const m = /^#c=([A-Za-z0-9_-]+)/.exec(location.hash); if (!m) return null; try { return b64d(m[1]); } catch (e) { return null; } }

  /* ---------- historial ---------- */
  function getHist() { try { return JSON.parse(store.get('hist', '[]')); } catch (e) { return []; } }
  function addHistory(src) { let h = getHist().filter(x => x !== src); h.unshift(src); h = h.slice(0, 15); store.set('hist', JSON.stringify(h)); renderHist(); }
  function renderHist() {
    const h = getHist(); const box = $('#hist');
    if (!h.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<h3>' + esc(t('histH')) + '</h3><ul>' + h.map((x, i) => '<li><button data-h="' + i + '" title="' + esc(x) + '">' + esc(x.replace(/\s+/g, ' ')) + '</button></li>').join('') + '</ul><p><button class="btn" id="histClear" style="padding:3px 10px;font-size:.8rem">' + esc(t('histClear')) + '</button></p>';
  }

  /* ---------- chips ---------- */
  function renderChips() {
    const G = CmdExamples.groups;
    const pick = [G[0].items[0], G[0].items[2], G[1].items[3], G[1].items[4], G[2].items[0], G[5].items[2], G[5].items[0], G[5].items[3]];
    $('#chips').innerHTML = pick.map(e => '<button class="chip' + (G[5].items.includes(e) ? ' danger' : '') + '" data-c="' + esc(e.c) + '" title="' + esc(e[lang][0]) + '">' + esc(e.c.length > 46 ? e.c.slice(0, 44) + '…' : e.c) + '</button>').join('');
  }

  /* ---------- pestañas ---------- */
  function setTab(name) {
    $$('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    $$('.tab').forEach(s => { s.hidden = s.id !== 'tab-' + name; });
    if (name === 'examples') renderExamples();
    if (name === 'catalog') renderCatalog();
    if (name === 'about') renderAbout();
    store.set('tab', name);
  }
  function renderExamples() {
    const G = CmdExamples.groups;
    $('#tab-examples').innerHTML = '<h2 class="h2">' + esc(t('examplesH')) + '</h2><p class="lead">' + esc(t('examplesLead')) + '</p>' + G.map(g => '<div class="egroup"><h3>' + esc(g[lang]) + '</h3><div class="egrid">' + g.items.map(e => '<div class="ecard' + (g.danger ? ' danger' : '') + '"><h4>' + esc(e[lang][0]) + '</h4><code>' + esc(e.c) + '</code><p>' + esc(e[lang][1]) + '</p><button class="btn" data-c="' + esc(e.c) + '">' + esc(t('analyse')) + '</button></div>').join('') + '</div></div>').join('');
  }

  /* ---------- catálogo ---------- */
  let catSel = null;
  async function renderCatalog() {
    const box = $('#tab-catalog');
    if (!box.dataset.ready) {
      await data.init();
      box.innerHTML = '<h2 class="h2">' + esc(t('catH')) + '</h2><p class="lead">' + esc(t('catLead')) + '</p><div class="cat"><div class="cat-list"><input id="catQ" type="search" placeholder="' + esc(t('catSearch')) + '" aria-label="' + esc(t('catSearch')) + '"><ul id="catUl"></ul></div><div class="cat-detail" id="catDet"><p class="lead">' + esc(t('catPick')) + '</p></div></div>';
      box.dataset.ready = '1';
      $('#catQ').addEventListener('input', fillCat);
      $('#catUl').addEventListener('click', (e) => { const b = e.target.closest('button[data-n]'); if (b) showCmd(b.dataset.n); });
      $('#catDet').addEventListener('input', (e) => { if (e.target.id === 'catF') filterOpts(e.target.value); });
    } else {
      $('h2.h2', box).textContent = t('catH'); $('p.lead', box).textContent = t('catLead'); $('#catQ').placeholder = t('catSearch');
    }
    fillCat();
    if (catSel) showCmd(catSel);
  }
  function fillCat() {
    const q = $('#catQ').value.trim().toLowerCase();
    let list = data.names;
    if (q) list = list.filter(c => c[0].toLowerCase().includes(q) || (c[2] || '').toLowerCase().includes(q));
    list = list.slice().sort((a, b) => (b[3] - a[3]) || a[0].localeCompare(b[0]));
    const shown = list.slice(0, 400);
    $('#catUl').innerHTML = shown.length ? shown.map(c => '<li><button data-n="' + esc(c[0]) + '"' + (c[0] === catSel ? ' aria-current="true"' : '') + '><span>' + (c[3] ? '● ' : '') + esc(c[0]) + '</span><small>' + c[4] + '</small></button></li>').join('') + (list.length > 400 ? '<li><small style="padding:6px 8px;display:block;color:var(--muted)">' + esc(t('catShown')) + ' 400 / ' + list.length + '</small></li>' : '') : '<li><small style="padding:8px;display:block;color:var(--muted)">' + esc(t('catNone')) + '</small></li>';
  }
  async function showCmd(name) {
    catSel = name;
    const rec = await data.get(name); if (!rec) return;
    $$('#catUl button').forEach(b => b.setAttribute('aria-current', String(b.dataset.n === name)));
    const sum = (lang === 'es' && rec.s.es) || rec.s.en || '';
    const en = lang === 'es' && !rec.s.es && rec.s.en;
    let h = '<h2>' + esc(rec.n) + '</h2><p>' + esc(sum) + (en ? ' <span class="badge en" title="' + esc(t('enTip')) + '">EN</span>' : '') + '</p>';
    if (rec.al && rec.al.length) h += '<p class="lead" style="margin:0 0 6px">' + esc(t('catAlias')) + ': <code>' + esc(rec.al.join(', ')) + '</code></p>';
    if (rec.syn) h += '<div class="syn">' + esc(rec.syn.split(' ⏎ ').join('\n')) + '</div>';
    if (rec.tip && rec.tip.length) h += '<p class="tips" style="border:0;padding:0"><b>' + esc(t('tips')) + ':</b> ' + rec.tip.map(esc).join(' · ') + '</p>';
    h += '<input id="catF" type="search" placeholder="' + esc(t('catFilter')) + ' (' + rec.o.length + ' ' + esc(t('catOpts')) + ')" aria-label="' + esc(t('catFilter')) + '" style="margin-top:8px"><table class="otable"><tbody id="catRows"></tbody></table>';
    $('#catDet').innerHTML = h;
    $('#catDet').dataset.rec = name;
    window.__catRec = rec;
    filterOpts('');
  }
  function filterOpts(q) {
    const rec = window.__catRec; if (!rec) return;
    q = q.toLowerCase();
    const rows = rec.o.filter(o => !q || o.f.join(' ').toLowerCase().includes(q) || (o.es || '').toLowerCase().includes(q) || (o.en || '').toLowerCase().includes(q)).slice(0, 500);
    $('#catRows').innerHTML = rows.map(o => {
      const d = lang === 'es' ? (o.es || o.en || '') : (o.en || o.es || '');
      const en = lang === 'es' && !o.es && o.en;
      return '<tr><td>' + esc(o.f.join(', ')) + (o.a ? '<small>' + (o.ao ? '[' + esc(o.a) + ']' : esc(o.a)) + '</small>' : '') + '</td><td>' + esc(d) + (en ? ' <span class="badge en" title="' + esc(t('enTip')) + '">EN</span>' : '') + '</td></tr>';
    }).join('');
  }

  /* ---------- acerca de ---------- */
  async function renderAbout() {
    await data.init();
    const cmds = data.names.length, cur = data.names.filter(c => c[3]).length, opts = data.names.reduce((a, c) => a + c[4], 0);
    const es = '<div class="about"><h2 class="h2">CmdLens</h2><p class="lead">Pega un comando de Linux y entiende, pieza a pieza, qué hace y qué puede salir mal, <b>antes</b> de ejecutarlo.</p>' +
      '<h3>Cómo funciona</h3><ol><li>Un analizador de shell (escrito para este proyecto) separa el texto en comandos, tuberías, redirecciones, sustituciones y estructuras como <code>if</code> o <code>for</code>.</li><li>Cada comando se busca en la base y cada opción se casa con su explicación: opciones agrupadas (<code>-xzvf</code>), largas y abreviadas (<code>--verb</code>), con valor pegado, y comandos con subcomandos (<code>git commit</code>, <code>ip addr</code>).</li><li>Los envoltorios (<code>sudo</code>, <code>bash -c</code>, <code>ssh host cmd</code>, <code>xargs</code>, <code>find -exec</code>…) se abren y se explica también el comando de dentro.</li><li>Un conjunto de reglas de seguridad avisa de borrados masivos, descargas que se ejecutan sin revisar, <i>reverse shells</i>, persistencia, permisos peligrosos y herramientas ofensivas.</li></ol>' +
      '<h3>La base de datos</h3><table><tr><th>Comandos</th><th>Con explicaciones revisadas en español</th><th>Opciones</th></tr><tr><td>' + cmds + '</td><td>' + cur + '</td><td>' + opts + '</td></tr></table><p>Se genera a partir de las páginas <code>man</code> de Kali/Debian (descripciones en inglés, marcadas con <span class="badge en">EN</span>) y de ficheros curados a mano con la explicación en español. Las reglas de riesgo y los explicadores de <code>chmod</code>, <code>sed</code>, <code>find</code>, <code>dd</code>, expresiones regulares, etc. son código propio.</p>' +
      '<h3>Límites</h3><ul><li>No ejecuta nada, así que no puede saber qué contienen tus variables, alias, funciones ni archivos.</li><li>Una opción que no aparece en la base se marca como «no reconocida»: puede ser válida en tu versión. Consulta siempre <code>man</code>.</li><li>Un aviso de riesgo es una ayuda, no una garantía: que no haya alertas no significa que el comando sea seguro.</li></ul>' +
      '<h3>Privacidad</h3><p>Todo ocurre en tu navegador. No hay servidor, cuentas ni analítica. El idioma, el tema y los comandos recientes se guardan solo en tu navegador (<code>localStorage</code>); el enlace «Copiar enlace» incluye el comando dentro de la dirección, pero nunca lo envía a ningún sitio.</p>' +
      '<h3>Créditos</h3><p>Inspirado en <a href="https://explainshell.com/" target="_blank" rel="noopener">explainshell</a> (Idan Kamara, GPL-3.0). CmdLens es una implementación independiente en JavaScript, sin código suyo, con licencia MIT. Las descripciones inglesas proceden de las páginas man de cada proyecto y conservan la licencia de sus autores.</p></div>';
    const en = '<div class="about"><h2 class="h2">CmdLens</h2><p class="lead">Paste a Linux command and understand, piece by piece, what it does and what can go wrong, <b>before</b> you run it.</p>' +
      '<h3>How it works</h3><ol><li>A shell parser (written for this project) splits the text into commands, pipelines, redirections, substitutions and structures such as <code>if</code> or <code>for</code>.</li><li>Each command is looked up in the database and each option is matched with its explanation: bundled options (<code>-xzvf</code>), long and abbreviated ones (<code>--verb</code>), attached values, and commands with subcommands (<code>git commit</code>, <code>ip addr</code>).</li><li>Wrappers (<code>sudo</code>, <code>bash -c</code>, <code>ssh host cmd</code>, <code>xargs</code>, <code>find -exec</code>…) are opened and the inner command is explained as well.</li><li>A set of security rules warns about mass deletion, downloads that run unreviewed, reverse shells, persistence, dangerous permissions and offensive tools.</li></ol>' +
      '<h3>The database</h3><table><tr><th>Commands</th><th>With reviewed Spanish explanations</th><th>Options</th></tr><tr><td>' + cmds + '</td><td>' + cur + '</td><td>' + opts + '</td></tr></table><p>Generated from the <code>man</code> pages of Kali/Debian (English descriptions) and hand-curated files with bilingual explanations. The risk rules and the explainers for <code>chmod</code>, <code>sed</code>, <code>find</code>, <code>dd</code>, regular expressions, etc. are original code.</p>' +
      '<h3>Limits</h3><ul><li>It executes nothing, so it cannot know what your variables, aliases, functions or files contain.</li><li>An option missing from the database is flagged "not recognised": it may be valid in your version. Always check <code>man</code>.</li><li>A risk warning is an aid, not a guarantee: no alerts does not mean the command is safe.</li></ul>' +
      '<h3>Privacy</h3><p>Everything happens in your browser. No server, accounts or analytics. Language, theme and recent commands are stored only in your browser (<code>localStorage</code>); the "Copy link" button puts the command inside the address but never sends it anywhere.</p>' +
      '<h3>Credits</h3><p>Inspired by <a href="https://explainshell.com/" target="_blank" rel="noopener">explainshell</a> (Idan Kamara, GPL-3.0). CmdLens is an independent JavaScript implementation, with none of its code, under the MIT license. English descriptions come from each project\'s man pages and keep their authors\' licenses.</p></div>';
    $('#tab-about').innerHTML = lang === 'en' ? en : es;
  }

  /* ---------- idioma y tema ---------- */
  function applyLang() {
    document.documentElement.lang = lang;
    $$('[data-i]').forEach(el => { const k = el.dataset.i; if (UI[lang][k] === undefined) return; if (/<a /.test(UI[lang][k])) el.innerHTML = UI[lang][k]; else el.textContent = UI[lang][k]; });
    $('#langBtn').textContent = lang.toUpperCase();
    $('#cmd').placeholder = 'tar -czvf copia.tar.gz ~/Documentos && rm -rf /tmp/cache';
    renderChips(); renderHist();
    const active = $$('.tabs button').find(b => b.getAttribute('aria-selected') === 'true');
    if (active) { if (active.dataset.tab !== 'explain') setTab(active.dataset.tab); }
  }
  function applyTheme(th) { document.documentElement.dataset.theme = th; $('#themeBtn').textContent = th === 'dark' ? '☾' : '☀'; store.set('theme', th); }

  /* ---------- eventos ---------- */
  function init() {
    $('#langBtn').addEventListener('click', () => { lang = lang === 'es' ? 'en' : 'es'; store.set('lang', lang); applyLang(); if (lastSrc) run(lastSrc, { save: false }); else $('#out').innerHTML = '<p class="lead">' + esc(t('empty')) + '</p>'; });
    $('#themeBtn').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
    $$('.tabs button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
    $('#goBtn').addEventListener('click', () => run($('#cmd').value));
    $('#clearBtn').addEventListener('click', () => { $('#cmd').value = ''; $('#out').innerHTML = '<p class="lead">' + esc(t('empty')) + '</p>'; $('#status').textContent = ''; lastSrc = ''; try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignorar */ } $('#cmd').focus(); });
    $('#linkBtn').addEventListener('click', async () => { const src = $('#cmd').value; if (!src.trim()) return; setHash(src); try { await navigator.clipboard.writeText(location.href); $('#status').textContent = t('copied'); } catch (e) { $('#status').textContent = t('copyFail'); } });
    let deb = null;
    $('#cmd').addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(() => { if ($('#cmd').value.trim()) run($('#cmd').value); }, 700); });
    $('#cmd').addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); clearTimeout(deb); run($('#cmd').value); } });
    document.addEventListener('click', (e) => {
      const c = e.target.closest('[data-c]');
      if (c) { setTab('explain'); $('#cmd').value = c.dataset.c; run(c.dataset.c); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      const hb = e.target.closest('button[data-h]');
      if (hb) { const s = getHist()[+hb.dataset.h]; if (s) { $('#cmd').value = s; run(s); } return; }
      if (e.target.id === 'histClear') { store.set('hist', '[]'); renderHist(); return; }
      const cl = e.target.closest('.clamp'); if (cl) cl.classList.toggle('clamp');
    });
    const hover = (e, on) => { const el = e.target.closest('[data-k]'); if (!el) return; $$('[data-k="' + el.dataset.k + '"]').forEach(x => x.classList.toggle('hl', on)); };
    document.addEventListener('mouseover', (e) => hover(e, true));
    document.addEventListener('mouseout', (e) => hover(e, false));
    window.addEventListener('hashchange', () => { const s = readHash(); if (s && s !== $('#cmd').value) { $('#cmd').value = s; setTab('explain'); run(s, { save: false }); } });
    const th = store.get('theme', document.documentElement.dataset.theme || 'dark');
    applyTheme(th); applyLang();
    const h = readHash();
    if (h) { $('#cmd').value = h; run(h, { save: false }); } else $('#out').innerHTML = '<p class="lead">' + esc(t('empty')) + '</p>';
    data.init().catch(() => { $('#out').innerHTML = '<div class="err"><h3>⚠</h3><p>No se pudo cargar la base de datos (data/index.json). Si abres el archivo directamente desde el disco, sírvelo con un servidor web local o usa la versión publicada.</p></div>'; });
    window.__cl = { run, engine, data };
  }
  init();
})();
