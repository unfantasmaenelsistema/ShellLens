/* ShellLens · motor de explicación.
 * explain(src) → {src, tree, units, risks, effects, error?}
 * Todo corre en el navegador; nada se ejecuta nunca. */
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const P = isNode ? require('./shell-parser.js') : root.ShellParser;
  const SPEC = isNode ? require('./special.js') : root.CmdSpecial;
  const RISK = isNode ? require('./risk.js') : root.CmdRisk;

  const SYSTEM_DIRS = ['/bin/', '/usr/bin/', '/sbin/', '/usr/sbin/', '/usr/local/bin/', '/usr/local/sbin/', '/opt/'];
  const MAX_DEPTH = 5;

  const ROLE_GLOSS = {
    FILE: ['archivo', 'file'], FILES: ['archivos', 'files'], DIRECTORY: ['directorio', 'directory'], DIR: ['directorio', 'directory'],
    SOURCE: ['origen', 'source'], SRC: ['origen', 'source'], DEST: ['destino', 'destination'], DESTINATION: ['destino', 'destination'],
    TARGET: ['objetivo', 'target'], PATTERN: ['patrón', 'pattern'], PATTERNS: ['patrones', 'patterns'], HOST: ['host (equipo)', 'host'],
    HOSTNAME: ['nombre de equipo', 'hostname'], USER: ['usuario', 'user'], USERNAME: ['usuario', 'username'], GROUP: ['grupo', 'group'],
    URL: ['dirección URL', 'URL'], COMMAND: ['comando', 'command'], CMD: ['comando', 'command'], PID: ['PID (identificador de proceso)', 'process ID'],
    NAME: ['nombre', 'name'], PATH: ['ruta', 'path'], PORT: ['puerto', 'port'], MODE: ['permisos', 'mode'], SIZE: ['tamaño', 'size'],
    NUM: ['número', 'number'], NUMBER: ['número', 'number'], STRING: ['texto', 'string'], TEXT: ['texto', 'text'], DEVICE: ['dispositivo', 'device'],
    PACKAGE: ['paquete', 'package'], SERVICE: ['servicio', 'service'], SCRIPT: ['guion', 'script'], EXPRESSION: ['expresión', 'expression'],
    ARCHIVE: ['archivo comprimido', 'archive'], IMAGE: ['imagen', 'image'], FORMAT: ['formato', 'format'], VAR: ['variable', 'variable'],
    OPTION: ['opción', 'option'], OPTIONS: ['opciones', 'options'], LINK_NAME: ['nombre del enlace', 'link name'], LINK: ['enlace', 'link'],
  };

  function createEngine(cfg) {
    const data = cfg.data;
    let lang = cfg.lang || 'es';
    const T = (es, en) => (lang === 'en' ? en : es);

    /* ---------- utilidades de palabras ---------- */
    function winfo(w) {
      const lit = P.plainLiteral(w) ? P.wordText(w) : null;
      return { w, start: w.start, end: w.end, raw: w.raw, lit, text: lit !== null ? lit : P.wordText(w) };
    }

    function glob(q) { return q.replace(/[.+^${}()|\\]/g, '\\$&'); }

    function roleFromSyn(syn, argsAfter) { // devuelve roles heurísticos a partir de la sinopsis
      if (!syn) return [];
      let first = syn.split(' ⏎ ')[0];
      first = first.replace(/\[-[^\]\[]*\]/g, ' ').replace(/\[--[^\]\[]*\]/g, ' ');
      const parts = first.replace(/\s+/g, ' ').trim().split(' ').slice(1);
      const roles = [];
      let depthOpt = 0;
      for (let tok of parts) {
        const optional = tok.startsWith('[');
        const variadic = /\.\.\.\]?$/.test(tok) || /…\]?$/.test(tok);
        let nm = tok.replace(/[\[\]<>{}.…|]/g, '').replace(/\s/g, '');
        if (!nm || /^(OPTION|OPTIONS|options?|opts?|flags?|OPTION\(S\))$/i.test(nm) || nm.startsWith('-')) continue;
        if (!/^[A-Za-z_][\w-]*$/.test(nm)) continue;
        roles.push({ n: nm, v: variadic ? 1 : 0, opt: optional ? 1 : 0, auto: 1 });
      }
      return roles;
    }

    function assignRoles(roles, operands, usedForms) {
      // devuelve array paralelo a operands con el rol (o null)
      const res = new Array(operands.length).fill(null);
      const act = roles.filter(r => !(r.u && r.u.some(f => usedForms.has(f))));
      let lo = 0, hi = operands.length - 1;
      const lasts = act.filter(r => r.l);
      const fronts = act.filter(r => !r.l);
      for (let k = lasts.length - 1; k >= 0; k--) { if (hi >= lo) { res[hi] = lasts[k]; hi--; } }
      // delanteros: los variádicos absorben el sobrante, respetando los obligatorios que les siguen
      let fi = 0;
      while (fi < fronts.length && lo <= hi) {
        const r = fronts[fi];
        if (r.v) {
          const after = fronts.slice(fi + 1).filter(x => !x.opt && !x.v).length;
          const take = Math.max(1, hi - lo + 1 - after);
          for (let c = 0; c < take && lo <= hi; c++) res[lo++] = r;
          fi++;
        } else { res[lo++] = r; fi++; }
      }
      // sobrante → último rol variádico o nada
      for (let c = lo; c <= hi; c++) { const lastv = [...fronts].reverse().find(x => x.v); res[c] = lastv || null; }
      return res;
    }

    function optDesc(o) {
      if (!o) return { text: '', en: false };
      if (lang === 'es') { if (o.es) return { text: o.es, en: false }; return { text: o.en || '', en: !!o.en }; }
      return { text: o.en || o.es || '', en: false };
    }

    function buildFormMap(rec) {
      if (rec._fm) return rec._fm;
      const m = new Map(); const longs = [];
      for (const o of rec.o || []) for (const f of o.f) { if (!m.has(f)) m.set(f, o); if (f.startsWith('--')) longs.push(f); }
      rec._fm = m; rec._longs = longs; return m;
    }

    function lookupForm(recs, f) { for (const r of recs) { const o = buildFormMap(r).get(f); if (o) return { o, rec: r }; } return null; }

    function resolveSub(rec, s) {
      if (s == null || !/^[A-Za-z][\w.-]*$/.test(s)) return null;
      if (rec.sd && rec.sd[s]) return s;
      if (rec.sa && rec.sa[s]) s = rec.sa[s];
      if (rec.sub && rec.sub.includes(s)) return s;
      const f = data.fileOf(rec.n + '-' + s);
      return f ? s : null;
    }

    /* ---------- resolución del nombre ---------- */
    function resolveCommandName(lit) {
      if (lit == null) return { kind: 'dynamic' };
      if (lit.includes('/')) {
        const base = lit.split('/').pop();
        const dir = lit.slice(0, lit.length - base.length);
        if (lit.startsWith('./') || lit.startsWith('../') || lit.startsWith('~')) return { kind: 'local', path: lit, base };
        if (SYSTEM_DIRS.includes(dir) && data.has(base)) return { kind: 'sys', name: base, path: lit };
        return { kind: 'local', path: lit, base };
      }
      if (data.has(lit)) return { kind: 'known', name: lit };
      return { kind: 'unknown', name: lit };
    }

    /* ---------- núcleo: casar opciones ---------- */
    async function matchArgs(rec, ws, ctx) {
      const tokens = [], operands = [], used = new Set();
      let recs = [rec], subName = null, subRec = null;
      let endOpts = false;
      const style = rec.st || 'gnu';
      const optFlag = (wi) => wi.lit != null && wi.lit.length > 1 && wi.lit[0] === '-' && wi.lit !== '--';
      let bsdTried = false;
      const m2 = { name: null };
      const stopFirst = !!(SPEC.WRAP[rec.n] || SPEC.SHELLS.has(rec.n) || rec.n === 'ssh' || rec.n === 'su' || rec.n === 'exec' || rec.n === 'eval');
      let stopped = false;

      function pushOpt(wi, label, o, rec2, extra) {
        const d = optDesc(o);
        let desc = d.text;
        if (o && o.a) desc += (desc ? ' ' : '') + (o.ao ? T('(valor opcional: ', '(optional value: ') : T('(necesita un valor: ', '(takes a value: ')) + o.a + ')';
        return { label, desc, en: d.en, form: o ? o.f[0] : label, ...(extra || {}) };
      }

      for (let i = 0; i < ws.length; i++) {
        const wi = ws[i];
        const s = wi.lit;
        if (!endOpts && s === '--') {
          tokens.push({ start: wi.start, end: wi.end, text: '--', role: 'opt', items: [{ label: '--', desc: T('Fin de opciones: lo que sigue se trata siempre como argumento, aunque empiece por «-».', 'End of options: everything after is treated as an argument, even if it starts with "-".') }] });
          endOpts = true; continue;
        }
        if (stopped) { operands.push({ wi, idx: i }); continue; }
        if (!endOpts && optFlag(wi)) {
          // 1) coincidencia exacta con alguna forma conocida
          let hit = lookupForm(recs, s);
          const eq = s.indexOf('=');
          let attached = null;
          if (!hit && eq > 1) { hit = lookupForm(recs, s.slice(0, eq)); if (hit) attached = s.slice(eq + 1); }
          if (hit) {
            const o = hit.o;
            const tk = { start: wi.start, end: wi.end, text: wi.raw, role: 'opt', items: [pushOpt(wi, s.slice(0, eq > 1 && attached !== null ? eq : undefined), o)] };
            if (attached === null && o.a && !o.ao && !s.startsWith('--') === false) { /* largo con valor separado */ }
            used.add(o.f[0]); o.f.forEach(f => used.add(f));
            if (o.a) {
              if (attached !== null) { tk.argText = attached; }
              else if (!o.ao && i + 1 < ws.length && !(ws[i + 1].lit && ws[i + 1].lit.startsWith('-') && ws[i + 1].lit.length > 1 && o.a && false)) {
                const av = ws[++i];
                tokens.push(tk);
                const at = { start: av.start, end: av.end, text: av.raw, role: 'optarg', items: [{ label: o.a, desc: T('Valor de ', 'Value of ') + s + '.' }], forOpt: o.f[0], value: av.lit };
                tokens.push(at); ctx.pendingArgs.push({ tok: at, wi: av, o, form: s }); continue;
              }
            }
            tokens.push(tk);
            if (attached !== null) ctx.pendingArgs.push({ tok: tk, wi, o, form: s.slice(0, eq), attached });
            continue;
          }
          // 2) opción larga abreviada (GNU)
          if (s.startsWith('--')) {
            const nm = eq > 1 ? s.slice(0, eq) : s;
            const cands = [];
            for (const r of recs) { buildFormMap(r); for (const l of r._longs) if (l.startsWith(nm)) cands.push([l, r]); }
            const uniq = [...new Set(cands.map(c => c[0]))];
            const groups = new Set(uniq.map(l => lookupForm(recs, l).o));
            if (uniq.length && groups.size === 1) {
              const o = lookupForm(recs, uniq[0]).o;
              const tk = { start: wi.start, end: wi.end, text: wi.raw, role: 'opt', items: [pushOpt(wi, uniq[0], o, null, { note: T('«' + nm + '» es una abreviatura de ' + uniq[0], '"' + nm + '" is an abbreviation of ' + uniq[0]) })] };
              o.f.forEach(f => used.add(f));
              if (o.a && eq > 1) tk.argText = s.slice(eq + 1);
              else if (o.a && !o.ao && i + 1 < ws.length) { const av = ws[++i]; tokens.push(tk); const at = { start: av.start, end: av.end, text: av.raw, role: 'optarg', items: [{ label: o.a, desc: T('Valor de ', 'Value of ') + uniq[0] + '.' }], forOpt: o.f[0], value: av.lit }; tokens.push(at); ctx.pendingArgs.push({ tok: at, wi: av, o, form: uniq[0] }); continue; }
              tokens.push(tk); continue;
            }
            tokens.push({ start: wi.start, end: wi.end, text: wi.raw, role: 'opt', unknown: true, items: [{ label: nm, desc: T('Opción que no aparece en la base de ', 'Option not found in the database for ') + rec.n + T('. Puede ser válida en tu versión: consulta «man ' + rec.n + '» o «' + rec.n + ' --help».', '. It may still be valid in your version: check "man ' + rec.n + '" or "' + rec.n + ' --help".') }] });
            continue;
          }
          // 3) agrupadas: -xzvf, -n5, -I/usr/include
          const body = s.slice(1);
          const items = []; let consumedNext = null; let argTok = null;
          let unknown = false;
          for (let k = 0; k < body.length; k++) {
            const c = body[k];
            const h = lookupForm(recs, '-' + c);
            if (!h) {
              if (/^\d+$/.test(body.slice(k))) { // -5 (head -5), -20
                const nh = lookupForm(recs, '-NUM') || lookupForm(recs, '-n');
                items.push({ label: '-' + body.slice(k), desc: nh ? optDesc(nh.o).text : T('Valor numérico (la herramienta lo interpreta como número de líneas, nivel o cantidad).', 'Numeric value (the tool treats it as a count, level or amount).'), en: false });
                break;
              }
              items.push({ label: '-' + c, desc: T('Opción no incluida en la base para ' + rec.n + '.', 'Option not in the database for ' + rec.n + '.'), unknown: true }); unknown = true;
              if (k === 0 && body.length > 1) { // quizá sea una sola opción multi-letra desconocida
                items.length = 0; items.push({ label: s, desc: T('Opción no incluida en la base para ' + rec.n + '. Consulta «man ' + rec.n + '».', 'Option not in the database for ' + rec.n + '. Check "man ' + rec.n + '".'), unknown: true }); break;
              }
              continue;
            }
            const o = h.o;
            used.add('-' + c); o.f.forEach(f => used.add(f));
            const it = pushOpt(wi, '-' + c, o);
            items.push(it);
            if (o.a) {
              const rest = body.slice(k + 1);
              if (rest) { it.argText = rest; it.desc += ' → «' + rest + '»'; ctx.pendingArgs.push({ tok: null, item: it, wi, o, form: '-' + c, attached: rest }); break; }
              if (!o.ao && i + 1 < ws.length) { consumedNext = { o, c }; break; }
            }
          }
          const tk = { start: wi.start, end: wi.end, text: wi.raw, role: 'opt', items, unknown };
          tokens.push(tk);
          if (consumedNext) {
            const av = ws[++i];
            const at = { start: av.start, end: av.end, text: av.raw, role: 'optarg', items: [{ label: consumedNext.o.a, desc: T('Valor de -', 'Value of -') + consumedNext.c + '.' }], forOpt: consumedNext.o.f[0], value: av.lit };
            tokens.push(at); ctx.pendingArgs.push({ tok: at, wi: av, o: consumedNext.o, form: '-' + consumedNext.c });
          }
          continue;
        }
        // opciones con «+» (dig +short)
        if (!endOpts && s && s[0] === '+' && s.length > 1) {
          const hp = lookupForm(recs, s.includes('=') ? s.slice(0, s.indexOf('=')) : s);
          if (hp) { tokens.push({ start: wi.start, end: wi.end, text: wi.raw, role: 'opt', items: [pushOpt(wi, s, hp.o)] }); hp.o.f.forEach(f => used.add(f)); continue; }
        }
        // operando
        // ¿subcomando?
        if (!endOpts && !subName && s != null && (rec.sub || rec.sa || data.has(rec.n + '-' + s) || true)) {
          const sn = operands.length === 0 ? resolveSub(rec, s) : null;
          if (sn) {
            subName = sn;
            const realName = (rec.sa && rec.sa[s]) || s;
            const sdEntry = (rec.sd && (rec.sd[s] || rec.sd[realName])) || null;
            subRec = data.has(rec.n + '-' + realName) ? await data.get(rec.n + '-' + realName) : null;
            let sumTxt = sdEntry ? ((lang === 'es' ? sdEntry.es : (sdEntry.en || sdEntry.es)) || '') : '';
            let enB = false;
            if (!sumTxt && subRec) { sumTxt = (lang === 'es' && subRec.s.es) || subRec.s.en || ''; enB = lang === 'es' && !subRec.s.es; }
            tokens.push({ start: wi.start, end: wi.end, text: wi.raw, role: 'subcmd', items: [{ label: s + (s !== realName ? ' → ' + realName : ''), desc: (sumTxt ? sentence(sumTxt) : T('Subcomando «' + sn + '» de ' + rec.n + '.', 'Subcommand "' + sn + '" of ' + rec.n + '.')), en: enB }] });
            if (subRec) { buildFormMap(subRec); recs = [subRec, rec]; ctx.sub = subRec; }
            continue;
          }
        }
        // segundo nivel: ip addr add, docker compose up…
        if (!endOpts && subName && !m2.name && s != null && operands.length === 0 && subRec && subRec.sd && subRec.sd[s]) {
          const d2 = subRec.sd[s];
          m2.name = s;
          tokens.push({ start: wi.start, end: wi.end, text: wi.raw, role: 'subcmd', items: [{ label: s, desc: sentence(lang === 'es' ? d2.es : (d2.en || d2.es)) }] });
          continue;
        }
        // bsdfirst: tar xzvf, ps aux
        if (style === 'bsdfirst' && !bsdTried && i === 0 && operands.length === 0 && s && /^[A-Za-z]+$/.test(s) && tokens.every(t => t.role !== 'subcmd')) {
          bsdTried = true;
          const ok = [...s].every(c => lookupForm(recs, '~' + c) || lookupForm(recs, '-' + c));
          if (ok) {
            const items = []; let pendingArgs = [];
            for (const c of s) {
              const h = lookupForm(recs, '~' + c) || lookupForm(recs, '-' + c);
              used.add('-' + c); h.o.f.forEach(f => used.add(f));
              items.push(pushOpt(wi, c, h.o));
              if (h.o.a && !h.o.ao) pendingArgs.push({ o: h.o, c });
            }
            const tk = { start: wi.start, end: wi.end, text: wi.raw, role: 'opt', items, bsd: true };
            tokens.push(tk);
            for (const pa of pendingArgs) {
              if (i + 1 < ws.length) {
                const av = ws[++i];
                const at = { start: av.start, end: av.end, text: av.raw, role: 'optarg', items: [{ label: pa.o.a, desc: T('Valor de «' + pa.c + '».', 'Value of "' + pa.c + '".') }], forOpt: pa.o.f[0], value: av.lit };
                tokens.push(at); ctx.pendingArgs.push({ tok: at, wi: av, o: pa.o, form: '-' + pa.c });
              }
            }
            continue;
          }
        }
        operands.push({ wi, idx: i });
        if (stopFirst && !(rec.n === 'ssh' && operands.length === 1) && !(SPEC.WRAP[rec.n] && SPEC.WRAP[rec.n].skip >= operands.length)) stopped = true;
      }
      return { tokens, operands, used, subRec, subName, sub2: m2.name, recs };
    }

    /* ---------- expansiones dentro de una palabra ---------- */
    async function wordExtras(wi, ctx, depth, tok) {
      const extras = [];
      const nested = [];
      const w = wi.w;
      const scan = async (parts, inDq) => {
        for (const p of parts) {
          if (p.t === 'var') extras.push({ label: '$' + p.v, desc: varDesc(p.v) });
          else if (p.t === 'param') extras.push({ label: '${' + p.v + '}', desc: paramDesc(p.v) });
          else if (p.t === 'cmdsub') {
            extras.push({ label: (p.backtick ? '`' : '$(') + p.body + (p.backtick ? '`' : ')'), desc: T('Sustitución de comandos: se ejecuta primero lo de dentro y su salida reemplaza a esta expresión.', 'Command substitution: the inner command runs first and its output replaces this expression.') });
            if (depth < MAX_DEPTH) nested.push(await explainSource(p.body, ctx, depth + 1, T('Dentro de la sustitución', 'Inside the substitution')));
          } else if (p.t === 'arith') extras.push({ label: '$((' + p.v + '))', desc: T('Expansión aritmética: se calcula «' + p.v.trim() + '» y se sustituye por el resultado.', 'Arithmetic expansion: "' + p.v.trim() + '" is computed and replaced by its result.') });
          else if (p.t === 'procsub') {
            extras.push({ label: p.dir + '(' + p.body + ')', desc: p.dir === '<' ? T('Sustitución de procesos: la salida del comando se ofrece como si fuera un archivo de lectura.', 'Process substitution: the command output is offered as if it were a readable file.') : T('Sustitución de procesos: lo que se escriba en este «archivo» entra por la entrada del comando.', 'Process substitution: whatever is written to this "file" goes to the command input.') });
            if (depth < MAX_DEPTH) nested.push(await explainSource(p.body, ctx, depth + 1, T('Dentro de la sustitución de procesos', 'Inside the process substitution')));
          } else if (p.t === 'brace') extras.push({ label: p.v, desc: braceDesc(p.v) });
          else if (p.t === 'dq') await scan(p.parts, true);
          else if (p.t === 'ansi') extras.push({ label: "$'…'", desc: T('Cadena ANSI-C: las secuencias \\n, \\t, \\xHH, \\e… se convierten en el carácter real.', 'ANSI-C string: sequences like \\n, \\t, \\xHH, \\e… become the real character.') });
        }
      };
      await scan(w.parts, false);
      if (w.hasGlob || (wi.lit && /[*?]|\[[^\]]+\]/.test(wi.lit) && w.parts.some(p => p.t === 'lit' && /[*?\[]/.test(p.v)))) {
        const g = globDesc(w);
        if (g) extras.push({ label: wi.raw, desc: g });
      }
      if (w.parts.length && w.parts[0].t === 'lit' && w.parts[0].v.startsWith('~')) {
        const m = /^~([A-Za-z0-9_.-]*)/.exec(w.parts[0].v);
        extras.push({ label: '~' + (m ? m[1] : ''), desc: m && m[1] ? T('Directorio personal del usuario «' + m[1] + '».', 'Home directory of user "' + m[1] + '".') : T('Directorio personal del usuario actual (por ejemplo /home/tu_usuario).', 'Current user home directory (e.g. /home/your_user).') });
      }
      return { extras, nested };
    }

    function varDesc(v) {
      const known = {
        HOME: T('directorio personal del usuario', 'user home directory'), USER: T('nombre del usuario actual', 'current user name'), PATH: T('lista de directorios donde se buscan los programas', 'list of directories searched for programs'),
        PWD: T('directorio de trabajo actual', 'current working directory'), '?': T('código de salida del último comando (0 = éxito)', 'exit status of the last command (0 = success)'),
        '$': T('PID de la shell actual', 'PID of the current shell'), '!': T('PID del último proceso lanzado en segundo plano', 'PID of the last background process'), '@': T('todos los argumentos del script, cada uno por separado', 'all script arguments, each separate'),
        '*': T('todos los argumentos del script, juntos', 'all script arguments, joined'), '#': T('número de argumentos del script', 'number of script arguments'), '0': T('nombre del script', 'script name'),
        IFS: T('separador de campos de la shell', 'shell field separator'), SHELL: T('shell del usuario', 'user shell'), HOSTNAME: T('nombre del equipo', 'host name'), RANDOM: T('número aleatorio 0–32767', 'random number 0–32767'),
        UID: T('identificador numérico del usuario', 'numeric user ID'), EUID: T('UID efectivo (0 = root)', 'effective UID (0 = root)'), LD_PRELOAD: T('bibliotecas que se cargan antes que las demás (técnica típica de rootkits)', 'libraries loaded before all others (typical rootkit trick)'),
        TMPDIR: T('directorio temporal', 'temporary directory'), EDITOR: T('editor de texto por defecto', 'default text editor'), LANG: T('idioma y codificación', 'language and encoding'), OLDPWD: T('directorio anterior', 'previous directory'),
      };
      if (/^[0-9]$/.test(v) && v !== '0') return T('argumento posicional número ' + v, 'positional argument number ' + v);
      return T('Variable «' + v + '»: se sustituye por su valor' , 'Variable "' + v + '": replaced by its value') + (known[v] ? ' — ' + known[v] : '') + '.';
    }

    function paramDesc(v) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*|[#?!@*$0-9])(:?[-=?+]|##?|%%?|\/\/?|\^\^?|,,?|:)?(.*)$/.exec(v);
      if (!m) return T('Expansión de parámetros.', 'Parameter expansion.');
      const [, name, op, rest] = m;
      const map = {
        ':-': T('usa «' + rest + '» si la variable está vacía o sin definir', 'use "' + rest + '" if unset or empty'), '-': T('usa «' + rest + '» si no está definida', 'use "' + rest + '" if unset'),
        ':=': T('asigna «' + rest + '» si está vacía y lo usa', 'assign "' + rest + '" if empty and use it'), ':?': T('error si está vacía o sin definir', 'error if unset or empty'),
        ':+': T('usa «' + rest + '» solo si la variable tiene valor', 'use "' + rest + '" only if the variable has a value'),
        '#': T('quita el prefijo más corto que case con «' + rest + '»', 'strip the shortest prefix matching "' + rest + '"'), '##': T('quita el prefijo más largo que case con «' + rest + '»', 'strip the longest prefix matching "' + rest + '"'),
        '%': T('quita el sufijo más corto que case con «' + rest + '»', 'strip the shortest suffix matching "' + rest + '"'), '%%': T('quita el sufijo más largo que case con «' + rest + '»', 'strip the longest suffix matching "' + rest + '"'),
        '/': T('sustituye la primera coincidencia', 'replace the first match'), '//': T('sustituye todas las coincidencias', 'replace all matches'),
        '^^': T('convierte a mayúsculas', 'uppercase'), ',,': T('convierte a minúsculas', 'lowercase'), ':': T('subcadena (desplazamiento:longitud)', 'substring (offset:length)'),
      };
      if (name === '#' && !op) return T('Número de argumentos.', 'Number of arguments.');
      if (v.startsWith('#')) return T('Longitud (en caracteres) del valor de «' + v.slice(1) + '».', 'Length (in characters) of the value of "' + v.slice(1) + '".');
      return T('Expansión de «' + name + '»', 'Expansion of "' + name + '"') + (op && map[op] ? ': ' + map[op] : '') + '.';
    }

    function braceDesc(v) {
      const inner = v.slice(1, -1);
      let ex = '';
      const r = /^(-?\d+)\.\.(-?\d+)(?:\.\.(-?\d+))?$/.exec(inner);
      if (r) {
        const a = +r[1], b = +r[2], st = Math.abs(+r[3] || 1); const out = [];
        for (let x = a; (a <= b ? x <= b : x >= b) && out.length < 8; x += (a <= b ? st : -st)) out.push(x);
        ex = out.join(' ') + (Math.abs(b - a) / st >= 8 ? ' …' : '');
      } else if (/^[a-zA-Z]\.\.[a-zA-Z]$/.test(inner)) {
        const a = inner.charCodeAt(0), b = inner.charCodeAt(3); const out = [];
        for (let x = a; (a <= b ? x <= b : x >= b) && out.length < 8; x += (a <= b ? 1 : -1)) out.push(String.fromCharCode(x));
        ex = out.join(' ');
      } else ex = inner.split(',').join(' · ');
      return T('Expansión de llaves: la shell genera una palabra por elemento → ' + ex, 'Brace expansion: the shell generates one word per item → ' + ex);
    }

    function globDesc(w) {
      const txt = w.parts.filter(p => p.t === 'lit').map(p => p.v).join('');
      const bits = [];
      if (txt.includes('*')) bits.push(T('«*» = cualquier secuencia de caracteres', '"*" = any sequence of characters'));
      if (txt.includes('?')) bits.push(T('«?» = un carácter cualquiera', '"?" = any single character'));
      if (/\[[^\]]+\]/.test(txt)) bits.push(T('«[…]» = uno de los caracteres indicados', '"[…]" = one of the listed characters'));
      if (!bits.length) return null;
      return T('Patrón comodín (glob): la shell lo sustituye por los archivos que coincidan — ', 'Wildcard (glob): the shell replaces it with the matching files — ') + bits.join('; ') + '.';
    }

    /* ---------- redirecciones ---------- */
    async function explainRedirs(redirs, ctx, depth) {
      const toks = [];
      for (const r of redirs || []) {
        const op = r.op; const fd = r.fd;
        const tg = r.target ? winfo(r.target) : null;
        const tgText = tg ? tg.text : '';
        const start = r.token.start, end = r.target ? r.target.end : r.token.end;
        let desc = '';
        const stream = fd === '2' ? T('los errores (stderr)', 'errors (stderr)') : (fd === '1' || fd === undefined) ? T('la salida normal (stdout)', 'normal output (stdout)') : T('el descriptor ' + fd, 'descriptor ' + fd);
        const fx = [];
        if (op === '>' || op === '>|') { desc = T('Envía ' + stream + ' al archivo «' + tgText + '». Si existe, LO SOBRESCRIBE (lo vacía antes); si no existe, lo crea.', 'Sends ' + stream + ' to file "' + tgText + '". If it exists it is OVERWRITTEN (truncated first); otherwise it is created.'); fx.push('write'); }
        else if (op === '>>') { desc = T('Añade ' + stream + ' al final del archivo «' + tgText + '» sin borrar lo que ya tenga (lo crea si no existe).', 'Appends ' + stream + ' to the end of "' + tgText + '" without erasing it (created if missing).'); fx.push('write'); }
        else if (op === '<') { desc = T('Lee la entrada estándar (stdin) del archivo «' + tgText + '» en vez del teclado.', 'Reads standard input (stdin) from file "' + tgText + '" instead of the keyboard.'); fx.push('read'); }
        else if (op === '&>' || op === '&>>') { desc = T('Envía salida normal y errores juntos al archivo «' + tgText + '»' + (op === '&>>' ? ' (añadiendo al final)' : ' (sobrescribiendo)') + '.', 'Sends stdout and stderr together to "' + tgText + '"' + (op === '&>>' ? ' (appending)' : ' (overwriting)') + '.'); fx.push('write'); }
        else if (op === '>&' || op === '<&') {
          if (/^\d+$/.test(tgText)) desc = T('Duplica el descriptor: redirige ' + stream + ' al mismo destino que el descriptor ' + tgText + (tgText === '1' && fd === '2' ? ' → los errores se mezclan con la salida normal (idioma «2>&1»).' : '.'), 'Duplicates the descriptor: redirects ' + stream + ' to the same place as descriptor ' + tgText + (tgText === '1' && fd === '2' ? ' → errors are merged with normal output ("2>&1").' : '.'));
          else if (tgText === '-') desc = T('Cierra el descriptor.', 'Closes the descriptor.');
          else desc = T('Redirige ' + stream + ' a «' + tgText + '».', 'Redirects ' + stream + ' to "' + tgText + '".');
        }
        else if (op === '<<' || op === '<<-') { desc = T('Documento aquí (here-document): el texto que sigue, hasta la línea «' + r.delim + '», se pasa como entrada estándar' + (r.quotedDelim ? ' (sin expandir variables, porque el delimitador va entre comillas)' : ' (las variables $… sí se expanden)') + (op === '<<-' ? '; los tabuladores iniciales se ignoran' : '') + '.', 'Here-document: the text that follows, up to the line "' + r.delim + '", is fed as standard input' + (r.quotedDelim ? ' (no variable expansion since the delimiter is quoted)' : ' ($… variables are expanded)') + (op === '<<-' ? '; leading tabs are ignored' : '') + '.'); }
        else if (op === '<<<') desc = T('Cadena aquí (here-string): el texto «' + tgText + '» se pasa como entrada estándar.', 'Here-string: the text "' + tgText + '" is fed as standard input.');
        else if (op === '<>') desc = T('Abre «' + tgText + '» para lectura y escritura.', 'Opens "' + tgText + '" for reading and writing.');
        if (tgText === '/dev/null') desc += ' ' + T('«/dev/null» es el agujero negro del sistema: lo que se escribe ahí se descarta.', '"/dev/null" is the system black hole: anything written there is discarded.');
        if (/^\/dev\/(tcp|udp)\//.test(tgText)) { desc += ' ' + T('¡Ojo! «/dev/tcp» es una función de bash: abre una conexión de red (técnica habitual en reverse shells).', 'Careful! "/dev/tcp" is a bash feature: it opens a network connection (common in reverse shells).'); fx.push('net'); }
        if (/^\/dev\/(sd|nvme|hd|vd|mmcblk)/.test(tgText) && /[>]/.test(op)) { desc += ' ' + T('Escribir directamente en un dispositivo de bloque DESTRUYE el sistema de archivos.', 'Writing directly to a block device DESTROYS the filesystem.'); }
        const tok = { start, end, text: ctx.src.slice(start, end), role: 'redir', items: [{ label: (fd ? fd : '') + op + (tgText && !/^<</.test(op) ? (/&$/.test(op) ? '' : ' ') + tgText : ''), desc }], effects: fx, redir: { op, fd, target: tgText, tg } };
        if (tg) { const ex = await wordExtras(tg, ctx, depth, tok); tok.items.push(...ex.extras); if (ex.nested.length) tok.nested = ex.nested; }
        ctx.redirList.push(tok.redir);
        toks.push(tok);
      }
      return toks;
    }

    /* ---------- comando simple ---------- */
    async function explainCommand(node, ctx, depth) {
      const unit = {
        kind: 'cmd', start: node.start, end: node.end, src: ctx.src, name: '', found: false, tokens: [], redirTokens: [], nested: [],
        argv: [], opts: new Set(), operands: [], assigns: [], redirs: [], effects: new Set(), tips: [], chain: ctx.chain.slice(), notes: [],
      };
      ctx.units.push(unit);
      // asignaciones
      for (const a of node.assigns) {
        const m = /^([A-Za-z_][A-Za-z0-9_]*)(\+?=)(.*)$/s.exec(a.raw);
        const name = m[1], val = m[3];
        let d = T('Asigna el valor «' + val + '» a la variable «' + name + '»', 'Assigns "' + val + '" to variable "' + name + '"') + (node.words.length ? T(' solo durante este comando (no persiste).', ' for this command only (does not persist).') : T(' en la shell actual.', ' in the current shell.'));
        if (m[2] === '+=') d = T('Añade «' + val + '» al valor actual de «' + name + '».', 'Appends "' + val + '" to the current value of "' + name + '".');
        const tok = { start: a.token.start, end: a.token.end, text: a.raw, role: 'assign', items: [{ label: name + m[2], desc: d }] };
        const ex = await wordExtras(winfo(a.token), ctx, depth, tok);
        tok.items.push(...ex.extras); if (ex.nested.length) tok.nested = ex.nested;
        unit.tokens.push(tok); unit.assigns.push({ name, value: val });
      }
      const ws = node.words.map(winfo);
      unit.argv = ws.map(w => w.text);
      const redirToks = await explainRedirs(node.redirs, ctx, depth);
      unit.redirs = redirToks.map(t => t.redir);
      for (const t of redirToks) for (const f of t.effects || []) unit.effects.add(f);

      if (!ws.length) {
        unit.name = '';
        unit.summary = node.assigns.length ? T('Solo define variables en la shell.', 'Only defines shell variables.') : T('Solo aplica redirecciones.', 'Only applies redirections.');
        unit.tokens.push(...redirToks);
        unit.tokens.sort((a, b) => a.start - b.start);
        return unit;
      }

      const head = ws[0];
      const res = resolveCommandName(head.lit);
      const headTok = { start: head.start, end: head.end, text: head.raw, role: 'cmd', items: [] };
      unit.tokens.push(headTok);
      let rec = null;
      if (res.kind === 'dynamic') {
        unit.name = head.text;
        headTok.items.push({ label: head.raw, desc: T('El nombre del comando se calcula al ejecutar (variable o sustitución). No se puede saber qué programa será sin ejecutarlo: es una señal de alerta en scripts desconocidos.', 'The command name is computed at run time (variable or substitution). You cannot know which program it is without running it: a red flag in unknown scripts.') });
        const ex = await wordExtras(head, ctx, depth, headTok);
        headTok.items.push(...ex.extras); if (ex.nested.length) headTok.nested = ex.nested;
        unit.summary = T('Comando dinámico.', 'Dynamic command.');
        for (let i = 1; i < ws.length; i++) {
          const t = { start: ws[i].start, end: ws[i].end, text: ws[i].raw, role: 'operand', items: [{ label: T('argumento', 'argument'), desc: '' }] };
          const e2 = await wordExtras(ws[i], ctx, depth, t); t.items.push(...e2.extras); if (e2.nested.length) t.nested = e2.nested; unit.tokens.push(t);
        }
        unit.tokens.push(...redirToks); unit.tokens.sort((a, b) => a.start - b.start);
        unit.dynamic = true;
        return unit;
      }
      if (res.kind === 'known' || res.kind === 'sys') {
        unit.name = res.name; rec = await data.get(res.name);
        unit.found = !!rec;
      } else if (res.kind === 'local') {
        unit.name = head.text; unit.local = true;
      } else { unit.name = res.name; }
      unit.display = unit.name;
      if (!rec) {
        const why = res.kind === 'local'
          ? T('Ejecuta el programa o guion «' + head.text + '» (ruta explícita). Lo que haga depende de su contenido: lee el archivo antes de ejecutarlo.', 'Runs the program or script "' + head.text + '" (explicit path). What it does depends on its content: read the file before running it.')
          : T('«' + head.text + '» no está en la base de ShellLens: puede ser un alias, una función de tu shell o un programa instalado aparte. Prueba «man ' + head.text + '» o «' + head.text + ' --help».', '"' + head.text + '" is not in the ShellLens database: it may be an alias, a shell function or separately installed software. Try "man ' + head.text + '" or "' + head.text + ' --help".');
        headTok.items.push({ label: head.raw, desc: why });
        unit.summary = why;
        for (let i = 1; i < ws.length; i++) {
          const w = ws[i]; const t = { start: w.start, end: w.end, text: w.raw, role: w.lit && w.lit[0] === '-' && w.lit.length > 1 ? 'opt' : 'operand', items: [{ label: w.lit && w.lit[0] === '-' ? w.raw : T('argumento', 'argument'), desc: T('Sin información: comando fuera de la base.', 'No information: command outside the database.') }], unknown: true };
          const ex = await wordExtras(w, ctx, depth, t); t.items.push(...ex.extras); if (ex.nested.length) t.nested = ex.nested;
          unit.tokens.push(t);
        }
        unit.tokens.push(...redirToks); unit.tokens.sort((a, b) => a.start - b.start);
        unit.unknown = true;
        return unit;
      }
      // comando conocido
      const sumTxt = (lang === 'es' && rec.s.es) || rec.s.en || '';
      if (sumTxt) headTok.items.push({ label: unit.name, desc: sentence(sumTxt), en: lang === 'es' && !rec.s.es });
      if (res.kind === 'sys') headTok.items.push({ label: res.path, desc: T('Ruta absoluta: ejecuta exactamente ese programa, sin buscarlo en el PATH.', 'Absolute path: runs exactly that program, without PATH lookup.') });
      (rec.tg || []).forEach(t => unit.effects.add(t));
      unit.rec = rec; unit.tips = (rec.tip || []).map(tipTxt);

      const sp = SPEC.get(rec.x || rec.n);
      const pctx = { pendingArgs: [], sub: null };
      let wsUse = ws.slice(1);
      let special = null;
      if (sp && sp.pre) {
        special = await sp.pre({ T, lang, ws: wsUse, unit, ctx, rec, explainSource: (s, l) => explainSource(s, ctx, depth + 1, l), explainWords: (words, l) => explainWords(words, ctx, depth + 1, l), depth });
        if (special && special.ws) wsUse = special.ws;
      }
      const m = await matchArgs(rec, wsUse, pctx);
      unit.matched = m;
      m.used.forEach(f => unit.opts.add(f));
      unit.subName = m.subName; unit.sub2 = m.sub2; if (m.subName) { unit.display = unit.name + ' ' + m.subName + (m.sub2 ? ' ' + m.sub2 : ''); unit.subRec = m.subRec; if (m.subRec) { (m.subRec.tg || []).forEach(t => unit.effects.add(t)); unit.tips = (m.subRec.tip || []).map(tipTxt).concat(unit.tips); } }
      unit.tokens.push(...m.tokens);
      // roles de operandos
      const main = m.subRec || rec;
      let roles = main.p || (m.subRec ? null : null) || rec.p;
      if (!roles) roles = roleFromSyn(main.syn || rec.syn);
      const opsArr = m.operands;
      const assigned = assignRoles(roles, opsArr, m.used);
      const operandToks = [];
      for (let k = 0; k < opsArr.length; k++) {
        const { wi } = opsArr[k]; const r = assigned[k];
        let label = T('argumento', 'argument'), desc = '';
        if (r) {
          const g = ROLE_GLOSS[r.n.toUpperCase()];
          label = (r.es && lang === 'es') ? r.n : (r.en && lang === 'en' ? r.n : (r.auto && g ? (lang === 'es' ? g[0] : g[1]) : r.n));
          desc = (lang === 'es' ? (r.es || '') : (r.en || r.es || '')) || (r.auto && g ? (lang === 'es' ? capitalize(g[0]) : capitalize(g[1])) : '');
        }
        const t = { start: wi.start, end: wi.end, text: wi.raw, role: 'operand', items: [{ label, desc }], value: wi.lit, roleName: r ? r.n : null };
        const ex = await wordExtras(wi, ctx, depth, t); t.items.push(...ex.extras); if (ex.nested.length) t.nested = ex.nested;
        operandToks.push(t); unit.tokens.push(t);
        unit.operands.push(wi.lit != null ? wi.lit : wi.text);
      }
      // extras por argumento de opción
      for (const pa of pctx.pendingArgs) {
        const tok = pa.tok;
        if (tok) { const ex = await wordExtras(pa.wi, ctx, depth, tok); tok.items.push(...ex.extras); if (ex.nested.length) tok.nested = (tok.nested || []).concat(ex.nested); }
      }
      // explicadores especiales (sed, chmod, find…)
      if (sp && sp.post) {
        await sp.post({ T, lang, unit, ctx, rec: main, parent: rec, ws: wsUse, operands: opsArr, operandToks, tokens: m.tokens, pending: pctx.pendingArgs, special, explainSource: (s, l) => explainSource(s, ctx, depth + 1, l), explainWords: (words, l) => explainWords(words, ctx, depth + 1, l), depth, winfo });
      }
      // envoltorios: sudo, env, xargs, bash -c...
      const W = SPEC.wrapper(rec.n, unit, opsArr, T, lang);
      if (W && depth < MAX_DEPTH) await handleWrapper(W, unit, opsArr, ctx, depth, operandToks);

      unit.tokens.push(...redirToks);
      unit.tokens.sort((a, b) => a.start - b.start || a.end - b.end);
      unit.summary = sumTxt ? sentence(sumTxt) : '';
      return unit;
    }

    async function handleWrapper(W, unit, opsArr, ctx, depth, operandToks) {
      if (W.kind === 'string') { // bash -c 'cmd'
        const idx = W.index;
        const wi = opsArr[idx] && opsArr[idx].wi;
        if (!wi) return;
        operandToks[idx].items.unshift({ label: T('guion a ejecutar', 'script to run'), desc: W.desc });
        if (wi.lit != null) {
          const label = W.label;
          const nsrc = await explainSource(wi.lit, ctx, depth + 1, label);
          operandToks[idx].nested = (operandToks[idx].nested || []).concat([nsrc]);
        } else operandToks[idx].items.push({ label: '!', desc: T('El texto a ejecutar se calcula dinámicamente: no se puede analizar sin ejecutarlo.', 'The text to run is computed dynamically: it cannot be analysed without running it.') });
        return;
      }
      // kind 'argv': el resto de operandos es otro comando
      const from = W.index;
      const rest = opsArr.slice(from).map(o => o.wi);
      // env: VAR=valor delante
      let startAt = 0;
      if (W.assigns) { while (startAt < rest.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(rest[startAt].text)) startAt++; }
      const inner = rest.slice(startAt);
      if (!inner.length) return;
      const note = { label: W.label, desc: W.desc };
      for (let k = 0; k < opsArr.length; k++) { if (k >= from + startAt) operandToks[k].role = 'operand'; }
      const innerSrcNode = { type: 'command', assigns: [], words: inner.map(x => x.w), redirs: [], start: inner[0].start, end: inner[inner.length - 1].end };
      const sub = await explainSubCommand(innerSrcNode, ctx, depth + 1, W.label, unit.name);
      const first = operandToks[from + startAt];
      if (first) { first.nested = (first.nested || []).concat([sub]); first.items = [{ label: T('comando interno', 'inner command'), desc: W.desc }]; first.role = 'cmd'; }
      const innerToks = new Map(); for (const u2 of sub.units) for (const tk2 of u2.tokens) innerToks.set(tk2.start, tk2);
      for (let k = from + startAt + 1; k < operandToks.length; k++) { const it = innerToks.get(operandToks[k].start); if (it) operandToks[k].role = it.role === 'optarg' ? 'optarg' : it.role; operandToks[k].hidden = true; }
      unit.effects.add('exec');
      if (W.effects) W.effects.forEach(e => unit.effects.add(e));
    }

    async function explainSubCommand(cmdNode, ctx, depth, label, wrapperName) {
      const c2 = { ...ctx, chain: ctx.chain.concat([wrapperName]) };
      const u = await explainCommand(cmdNode, c2, depth);
      return { kind: 'nested', label, src: ctx.src, outer: true, tree: { kind: 'cmd', unit: u }, units: [u] };
    }

    async function explainWords(words, ctx, depth, label) { // lista de palabras ya separadas (find -exec …)
      const node = { type: 'command', assigns: [], words: words.map(w => w.w || w), redirs: [], start: words[0].start, end: words[words.length - 1].end };
      return explainSubCommand(node, ctx, depth, label, '');
    }

    function tipTxt(x) { return typeof x === 'string' ? x : (lang === 'en' ? (x.en || x.es) : x.es); }
    function capitalize(s) { s = (s || '').trim(); return s ? s[0].toUpperCase() + s.slice(1) : s; }
    function sentence(s) { s = capitalize(s); return s && !/[.!?…]$/.test(s) ? s + '.' : s; }

    /* ---------- estructura ---------- */
    async function explainNode(node, ctx, depth) {
      switch (node.type) {
        case 'command': return { kind: 'cmd', unit: await explainCommand(node, ctx, depth) };
        case 'pipeline': {
          const stages = [];
          for (const c of node.cmds) stages.push(await explainNode(c, ctx, depth));
          return { kind: 'pipe', stages, ops: node.ops, negate: node.negate, timed: node.timed };
        }
        case 'andor': {
          const seq = [];
          for (const s of node.seq) seq.push({ op: s.op, node: await explainNode(s.node, ctx, depth) });
          return { kind: 'andor', seq };
        }
        case 'list': {
          const items = [];
          for (const it of node.items) items.push({ op: it.op, node: await explainNode(it.node, ctx, depth) });
          return { kind: 'seq', items };
        }
        case 'group': {
          const body = await explainNode(node.body, ctx, depth);
          const redirToks = await explainRedirs(node.redirs, ctx, depth);
          return { kind: 'group', group: node.kind, body, redirToks };
        }
        case 'compound': return explainCompound(node, ctx, depth);
      }
      return { kind: 'unknown' };
    }

    async function explainCompound(node, ctx, depth) {
      const redirToks = await explainRedirs(node.redirs, ctx, depth);
      switch (node.kind) {
        case 'if': {
          const branches = [];
          for (const b of node.branches) branches.push({ cond: await explainNode(b.cond, ctx, depth), body: await explainNode(b.body, ctx, depth) });
          return { kind: 'if', branches, else: node.else ? await explainNode(node.else, ctx, depth) : null, redirToks };
        }
        case 'for': case 'select': {
          const items = [];
          for (const w of node.items || []) { const wi = winfo(w); const ex = await wordExtras(wi, ctx, depth, null); items.push({ text: wi.raw, extras: ex.extras, nested: ex.nested }); }
          return { kind: 'for', loop: node.kind, varName: node.varName, items: node.items ? items : null, arith: node.arith, body: await explainNode(node.body, ctx, depth), redirToks };
        }
        case 'while': case 'until':
          return { kind: 'while', loop: node.kind, cond: await explainNode(node.cond, ctx, depth), body: await explainNode(node.body, ctx, depth), redirToks };
        case 'case': {
          const clauses = [];
          for (const c of node.clauses) clauses.push({ pats: c.pats, body: await explainNode(c.body, ctx, depth) });
          return { kind: 'case', subject: node.subject, clauses };
        }
        case 'function': return { kind: 'function', name: node.name, body: await explainNode(node.body.type === 'group' ? node.body : { type: 'list', items: [{ node: node.body, op: ';' }] }, ctx, depth) };
        case 'testbracket': return { kind: 'test', words: node.words.map(w => winfo(w).text), text: ctx.src.slice(node.words[0].start, node.words[node.words.length - 1].end) };
        case 'arith': return { kind: 'arith', expr: node.expr };
      }
      return { kind: 'unknown' };
    }

    /* ---------- fuente completa ---------- */
    async function explainSource(src, parentCtx, depth, label) {
      const ctx = { src, units: [], chain: parentCtx ? parentCtx.chain : [], redirList: [], pendingArgs: [], root: parentCtx ? parentCtx.root : null };
      const r = P.tryParse(src);
      if (!r.ok) return { kind: 'nested', label, src, error: r.error, pos: r.pos, units: [] };
      const tree = await explainNode(r.tree, ctx, depth);
      if (parentCtx) parentCtx.units.push(...ctx.units);
      return { kind: 'nested', label, src, tree, units: ctx.units };
    }

    async function preload(src, seen) {
      // precarga de datos: recorre el AST y descarga los comandos (y sus subcomandos probables)
      const r = P.tryParse(src); if (!r.ok) return;
      const names = new Set();
      const walk = (n) => {
        if (!n) return;
        if (n.type === 'command') {
          const hd = n.words[0]; if (hd) { const l = P.plainLiteral(hd) ? P.wordText(hd) : null; if (l) names.add(l.split('/').pop()); }
          for (const w of n.words) for (const p of w.parts) { if (p.t === 'cmdsub' || p.t === 'procsub') names.add({ sub: p.body }); }
          for (const w of n.words.slice(1)) { if (P.plainLiteral(w)) { const l = P.wordText(w); if (/^[A-Za-z][\w.-]*$/.test(l)) names.add('~' + (hd ? P.wordText(hd) : '') + '-' + l); } }
        }
        for (const k of ['items', 'seq', 'cmds', 'branches']) if (n[k]) n[k].forEach(x => walk(x.node || x.cond || x)), n[k].forEach(x => { if (x.body) walk(x.body); });
        for (const k of ['body', 'else', 'cond']) if (n[k]) walk(n[k]);
        if (n.clauses) n.clauses.forEach(c => walk(c.body));
      };
      walk(r.tree);
      const jobs = [];
      for (const n of names) {
        if (typeof n === 'string') { const nm = n.startsWith('~') ? n.slice(1) : n; if (data.has(nm)) jobs.push(data.get(nm)); }
        else if (n.sub && depthOk(seen)) jobs.push(preload(n.sub, seen + 1));
      }
      await Promise.all(jobs);
    }
    function depthOk(d) { return d < 3; }

    return {
      setLang(l) { lang = l; },
      async explain(src) {
        await data.init();
        await preload(src, 0).catch(() => {});
        const ctx = { src, units: [], chain: [], redirList: [], pendingArgs: [] };
        const r = P.tryParse(src);
        if (!r.ok) return { src, error: r.error, pos: r.pos, units: [], risks: [], effects: [] };
        const tree = await explainNode(r.tree, ctx, 0);
        const result = { src, tree, units: ctx.units, risks: [], effects: [] };
        result.risks = RISK.analyze({ src, parsed: r.tree, units: ctx.units, T, lang });
        const eff = new Set(); ctx.units.forEach(u => u.effects.forEach(e => eff.add(e)));
        result.effects = [...eff];
        return result;
      },
    };
  }

  const api = { createEngine };
  if (isNode) module.exports = api; else root.CmdEngine = api;
})(typeof self !== 'undefined' ? self : this);
