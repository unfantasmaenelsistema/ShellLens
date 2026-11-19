/* CmdLens · parser de shell (subconjunto práctico de bash/POSIX sh).
 * No ejecuta nada: solo convierte el texto en un árbol que el motor explica.
 *
 * Nodos de salida:
 *   {type:'list',   items:[ {node, op} ]}                 ; & && || y saltos de línea
 *   {type:'pipeline', cmds:[node], ops:['|'|'|&'], negate}
 *   {type:'command', assigns:[], words:[Word], redirs:[Redir], raw}
 *   {type:'group', kind:'subshell'|'brace', body:list, redirs}
 *   {type:'compound', kind:'if'|'for'|'while'|'until'|'case'|'function'|..., ...}
 * Word: {text, parts:[{t:'lit'|'sq'|'dq'|'ansi'|'var'|'cmdsub'|'arith'|'procsub'|'param'|'glob'|'brace'|'tilde', ...}], quoted, raw, start, end}
 */
(function (root) {
  'use strict';

  const OPERATORS = ['&>>', '<<<', '<<-', '>>', '<<', '&&', '||', ';;', '|&', '>&', '<&', '>|', '<>', '&>', ';&',
    '|', '&', ';', '(', ')', '<', '>', '\n'];
  const RESERVED = new Set(['if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'until', 'do', 'done', 'case', 'esac',
    'in', 'select', 'function', '{', '}', '!', '[[', ']]', 'time', 'coproc']);

  class ParseError extends Error {
    constructor(msg, pos) { super(msg); this.pos = pos; }
  }

  /* ---------- Fase 1: tokenizador ---------- */
  function tokenize(src) {
    const toks = [];
    let i = 0;
    const n = src.length;
    const heredocs = []; // pendientes
    let atCmdStart = true;

    function readQuotedSingle() { // i apunta tras la comilla
      const s = i;
      while (i < n && src[i] !== "'") i++;
      if (i >= n) throw new ParseError('Falta cerrar la comilla simple', s - 1);
      const t = src.slice(s, i);
      i++;
      return t;
    }

    function readBalanced(open, close) { // devuelve contenido interno, i queda tras el cierre
      let depth = 1; const s = i;
      while (i < n) {
        const c = src[i];
        if (c === '\\') { i += 2; continue; }
        if (c === "'") { i++; while (i < n && src[i] !== "'") i++; i++; continue; }
        if (c === '"') { i++; while (i < n && src[i] !== '"') { if (src[i] === '\\') i++; i++; } i++; continue; }
        if (c === open) depth++;
        else if (c === close) { depth--; if (depth === 0) { const t = src.slice(s, i); i++; return t; } }
        i++;
      }
      throw new ParseError('Falta cerrar «' + open + '»', s);
    }

    function readBacktick() {
      const s = i;
      while (i < n && src[i] !== '`') { if (src[i] === '\\') i++; i++; }
      if (i >= n) throw new ParseError('Falta cerrar la comilla invertida', s - 1);
      const t = src.slice(s, i); i++; return t;
    }

    // Lee una «palabra» (sin separar por operadores) y la divide en partes.
    function readWord() {
      const start = i;
      const parts = [];
      let lit = '';
      let hasGlob = false;
      const flush = () => { if (lit) { parts.push({ t: 'lit', v: lit }); lit = ''; } };
      while (i < n) {
        const c = src[i];
        if (c === ' ' || c === '\t' || c === '\n') break;
        if (c === '|' || c === '&' || c === ';' || c === '(' || c === ')' || c === '<' || c === '>') {
          // «<(» y «>(» son sustitución de procesos
          if ((c === '<' || c === '>') && src[i + 1] === '(') {
            flush(); i += 2; const body = readBalanced('(', ')');
            parts.push({ t: 'procsub', dir: c, body });
            continue;
          }
          break;
        }
        if (c === '\\') {
          if (src[i + 1] === '\n') { i += 2; continue; } // continuación
          flush(); parts.push({ t: 'esc', v: src[i + 1] === undefined ? '' : src[i + 1] }); i += 2; continue;
        }
        if (c === "'") { flush(); i++; parts.push({ t: 'sq', v: readQuotedSingle() }); continue; }
        if (c === '"') { flush(); i++; parts.push(readDouble()); continue; }
        if (c === '$') {
          const nx = src[i + 1];
          if (nx === "'") { flush(); i += 2; parts.push({ t: 'ansi', v: readAnsi() }); continue; }
          if (nx === '"') { flush(); i += 2; parts.push(readDouble()); continue; }
          if (nx === '(') {
            flush();
            if (src[i + 2] === '(') { i += 3; const body = readBalanced('(', ')'); // cierra primer ) ; el segundo ) debe seguir
              if (src[i] === ')') i++;
              parts.push({ t: 'arith', v: body }); continue; }
            i += 2; const body = readBalanced('(', ')');
            parts.push({ t: 'cmdsub', body }); continue;
          }
          if (nx === '{') { flush(); i += 2; const body = readBalanced('{', '}'); parts.push({ t: 'param', v: body }); continue; }
          if (nx !== undefined && /[A-Za-z_]/.test(nx)) {
            flush(); i++; const s = i; while (i < n && /[A-Za-z0-9_]/.test(src[i])) i++;
            parts.push({ t: 'var', v: src.slice(s, i) }); continue;
          }
          if (nx !== undefined && /[0-9@*#?$!\-]/.test(nx)) { flush(); parts.push({ t: 'var', v: nx }); i += 2; continue; }
          lit += c; i++; continue;
        }
        if (c === '`') { flush(); i++; parts.push({ t: 'cmdsub', body: readBacktick(), backtick: true }); continue; }
        if (c === '*' || c === '?') { hasGlob = true; lit += c; i++; continue; }
        if (c === '[') { // glob si hay cierre en la misma palabra
          const m = /^\[[^\]\s]+\]/.exec(src.slice(i));
          if (m) { hasGlob = true; lit += m[0]; i += m[0].length; continue; }
          lit += c; i++; continue;
        }
        if (c === '{') { // expansión de llaves {a,b} o {1..5}
          const m = /^\{([^{}\s,]*(?:,[^{}\s]*)+|[^{}\s,]*\.\.[^{}\s,]*)\}/.exec(src.slice(i));
          if (m) { flush(); parts.push({ t: 'brace', v: m[0] }); i += m[0].length; continue; }
          lit += c; i++; continue;
        }
        lit += c; i++;
      }
      flush();
      return { parts, hasGlob, start, end: i };
    }

    function readDouble() { // i tras la comilla de apertura
      const s = i; const sub = [];
      let lit = '';
      const flush = () => { if (lit) { sub.push({ t: 'lit', v: lit }); lit = ''; } };
      while (i < n && src[i] !== '"') {
        const c = src[i];
        if (c === '\\' && i + 1 < n) {
          const nx = src[i + 1];
          if ('$`"\\\n'.includes(nx)) { if (nx !== '\n') lit += nx; i += 2; continue; }
          lit += c; i++; continue;
        }
        if (c === '$') {
          const nx = src[i + 1];
          if (nx === '(') {
            flush();
            if (src[i + 2] === '(') { i += 3; const b = readBalanced('(', ')'); if (src[i] === ')') i++; sub.push({ t: 'arith', v: b }); continue; }
            i += 2; sub.push({ t: 'cmdsub', body: readBalanced('(', ')') }); continue;
          }
          if (nx === '{') { flush(); i += 2; sub.push({ t: 'param', v: readBalanced('{', '}') }); continue; }
          if (nx !== undefined && /[A-Za-z_]/.test(nx)) { flush(); i++; const st = i; while (i < n && /[A-Za-z0-9_]/.test(src[i])) i++; sub.push({ t: 'var', v: src.slice(st, i) }); continue; }
          if (nx !== undefined && /[0-9@*#?$!\-]/.test(nx)) { flush(); sub.push({ t: 'var', v: nx }); i += 2; continue; }
          lit += c; i++; continue;
        }
        if (c === '`') { flush(); i++; sub.push({ t: 'cmdsub', body: readBacktick(), backtick: true }); continue; }
        lit += c; i++;
      }
      if (i >= n) throw new ParseError('Falta cerrar las comillas dobles', s - 1);
      i++; flush();
      return { t: 'dq', parts: sub };
    }

    function readAnsi() {
      const s = i; let out = '';
      while (i < n && src[i] !== "'") { if (src[i] === '\\') { out += src.slice(i, i + 2); i += 2; } else { out += src[i]; i++; } }
      if (i >= n) throw new ParseError("Falta cerrar $'…'", s - 2);
      i++; return out;
    }

    while (i < n) {
      const c = src[i];
      if (c === ' ' || c === '\t') { i++; continue; }
      if (c === '\\' && src[i + 1] === '\n') { i += 2; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '#' && (i === 0 || /[\s;|&(]/.test(src[i - 1]))) { // comentario
        const s = i; while (i < n && src[i] !== '\n') i++;
        toks.push({ k: 'comment', v: src.slice(s, i), start: s, end: i }); continue;
      }
      if (c === '\n') {
        toks.push({ k: 'op', v: '\n', start: i, end: i + 1 }); i++;
        // here-docs pendientes
        while (heredocs.length) {
          const h = heredocs.shift();
          const s = i; let body = '';
          let found = false;
          while (i < n) {
            let e = src.indexOf('\n', i); if (e < 0) e = n;
            let line = src.slice(i, e);
            const cmp = h.strip ? line.replace(/^\t+/, '') : line;
            i = Math.min(e + 1, n);
            if (cmp === h.delim) { found = true; break; }
            body += line + '\n';
          }
          h.tok.body = body; h.tok.closed = found; h.tok.bstart = s;
        }
        continue;
      }
      // operadores
      let matched = null;
      if ((c === '<' || c === '>') && src[i + 1] === '(') { const w0 = readWord(); toks.push({ k: 'word', parts: w0.parts, hasGlob: false, start: w0.start, end: w0.end, raw: src.slice(w0.start, w0.end) }); continue; }
      for (const op of OPERATORS) {
        if (op === '\n') continue;
        if (src.startsWith(op, i)) { matched = op; break; }
      }
      // número de descriptor pegado a redirección: 2>file, 2>&1
      if (!matched && /[0-9]/.test(c)) {
        const m = /^(\d+)(>>|>&|>\||>|<&|<<<|<<-|<<|<>|<)/.exec(src.slice(i));
        if (m) {
          const op = m[2];
          toks.push({ k: 'op', v: op, fd: m[1], start: i, end: i + m[0].length });
          i += m[0].length; continue;
        }
      }
      if (matched) {
        if (matched === '<(' ) { /* gestionado en readWord */ }
        const tok = { k: 'op', v: matched, start: i, end: i + matched.length };
        i += matched.length;
        toks.push(tok);
        if (matched === '<<' || matched === '<<-') {
          // leer delimitador ahora
          while (i < n && (src[i] === ' ' || src[i] === '\t')) i++;
          const w = readWord();
          const raw = src.slice(w.start, w.end);
          const delim = raw.replace(/^['"\\]|['"]$/g, '').replace(/\\/g, '');
          const quoted = /['"\\]/.test(raw);
          const wt = { k: 'word', parts: w.parts, hasGlob: false, start: w.start, end: w.end, raw };
          tok.delim = delim; tok.quotedDelim = quoted; tok.delimWord = wt;
          heredocs.push({ delim, strip: matched === '<<-', tok });
        }
        continue;
      }
      // palabra
      const w = readWord();
      if (w.end === w.start) { i++; continue; }
      toks.push({ k: 'word', parts: w.parts, hasGlob: w.hasGlob, start: w.start, end: w.end, raw: src.slice(w.start, w.end) });
    }
    return toks;
  }

  /* ---------- Fase 2: parser ---------- */
  function wordText(w) { // texto «aproximado» sin expansiones (para casar con tablas)
    let s = '';
    for (const p of w.parts) {
      if (p.t === 'lit' || p.t === 'sq' || p.t === 'esc' || p.t === 'ansi' || p.t === 'brace') s += (p.t === 'esc' ? p.v : p.v);
      else if (p.t === 'dq') s += p.parts.map(q => q.t === 'lit' ? q.v : (q.t === 'var' ? '$' + q.v : (q.t === 'param' ? '${' + q.v + '}' : '…'))).join('');
      else if (p.t === 'var') s += '$' + p.v;
      else if (p.t === 'param') s += '${' + p.v + '}';
      else if (p.t === 'cmdsub') s += '$(' + p.body + ')';
      else if (p.t === 'arith') s += '$((' + p.v + '))';
      else if (p.t === 'procsub') s += p.dir + '(' + p.body + ')';
    }
    return s;
  }

  function isQuotedWhole(w) { return w.parts.length > 0 && w.parts.every(p => p.t === 'sq' || p.t === 'dq' || p.t === 'ansi'); }
  function hasExpansion(w) { return w.parts.some(p => ['var', 'cmdsub', 'arith', 'param', 'procsub'].includes(p.t) || (p.t === 'dq' && p.parts.some(q => q.t !== 'lit'))); }
  function plainLiteral(w) { return w.parts.every(p => p.t === 'lit' || p.t === 'sq' || p.t === 'esc' || (p.t === 'dq' && p.parts.every(q => q.t === 'lit'))); }
  function literalValue(w) { return plainLiteral(w) ? wordText(w) : null; }

  function parse(src) {
    const toks = tokenize(src);
    let p = 0;
    const peek = () => toks[p];
    const next = () => toks[p++];
    const isOp = (t, v) => t && t.k === 'op' && (v === undefined || t.v === v);
    const kw = (t) => t && t.k === 'word' && t.parts.length === 1 && t.parts[0].t === 'lit' ? t.parts[0].v : null;
    const isKw = (t, v) => kw(t) === v;

    function skipNewlines() { while (peek() && (isOp(peek(), '\n') || peek().k === 'comment')) p++; }

    function parseList(terminators) {
      const items = [];
      skipNewlines();
      while (peek()) {
        const t = peek();
        if (terminators && terminators(t)) break;
        const node = parseAndOr(terminators);
        let op = ';';
        const nx = peek();
        if (nx && nx.k === 'op' && (nx.v === ';' || nx.v === '&' || nx.v === '\n')) { op = nx.v; p++; }
        items.push({ node, op });
        skipNewlines();
      }
      return { type: 'list', items };
    }

    function parseAndOr(terms) {
      let left = parsePipeline(terms);
      const seq = [{ node: left, op: null }];
      while (peek() && peek().k === 'op' && (peek().v === '&&' || peek().v === '||')) {
        const op = next().v;
        skipNewlines();
        if (!peek()) throw new ParseError('Falta el comando después de «' + op + '»', toks[p - 1].end);
        seq.push({ node: parsePipeline(terms), op });
      }
      return seq.length === 1 ? left : { type: 'andor', seq };
    }

    function parsePipeline(terms) {
      let negate = false;
      let timed = false;
      while (isKw(peek(), '!') || isKw(peek(), 'time')) { if (kw(peek()) === '!') negate = !negate; else timed = true; p++; }
      const cmds = [parseCommand(terms)];
      const ops = [];
      while (peek() && peek().k === 'op' && (peek().v === '|' || peek().v === '|&')) {
        ops.push(next().v);
        skipNewlines();
        if (!peek()) throw new ParseError('Falta el comando después de «|»', toks[p - 1].end);
        cmds.push(parseCommand(terms));
      }
      if (cmds.length === 1 && !negate && !timed) return cmds[0];
      return { type: 'pipeline', cmds, ops, negate, timed };
    }

    function parseRedirs(node) {
      node.redirs = node.redirs || [];
      while (peek() && peek().k === 'op' && /^(>>|>&|>\||>|<&|<<<|<<-|<<|<>|<|&>>|&>)$/.test(peek().v)) {
        const op = next();
        let target = null;
        if (op.v === '<<' || op.v === '<<-') {
          node.redirs.push({ op: op.v, fd: op.fd, delim: op.delim, body: op.body, quotedDelim: op.quotedDelim, token: op });
          continue;
        }
        const w = peek();
        if (!w || w.k !== 'word') throw new ParseError('Falta el destino de la redirección «' + op.v + '»', op.end);
        p++; target = w;
        node.redirs.push({ op: op.v, fd: op.fd, target, token: op });
      }
    }

    function parseCommand(terms) {
      const t = peek();
      if (!t) throw new ParseError('Comando vacío', src.length);
      if (isOp(t, '(')) {
        p++; const body = parseList(x => isOp(x, ')'));
        if (!isOp(peek(), ')')) throw new ParseError('Falta cerrar «)»', t.start);
        p++;
        const node = { type: 'group', kind: 'subshell', body, redirs: [] };
        parseRedirs(node); return node;
      }
      const k = kw(t);
      if (['then', 'do', 'done', 'fi', 'else', 'elif', 'esac', '}'].includes(k)) throw new ParseError('Símbolo inesperado «' + k + '»', t.start);
      if (isOp(t, '(') && toks[p + 1] && isOp(toks[p + 1], '(') && toks[p + 1].start === t.start + 1) {
        const arith = readArithCommand(t);
        if (arith) return arith;
      }
      if (k === '{') {
        p++; const body = parseList(x => isKw(x, '}'));
        if (!isKw(peek(), '}')) throw new ParseError('Falta cerrar «}»', t.start);
        p++;
        const node = { type: 'group', kind: 'brace', body, redirs: [] };
        parseRedirs(node); return node;
      }
      if (k === 'if') return parseIf();
      if (k === 'for' || k === 'select') return parseFor(k);
      if (k === 'while' || k === 'until') return parseWhile(k);
      if (k === 'case') return parseCase();
      if (k === 'function') return parseFunctionKw();
      if (k === '[[') return parseDoubleBracket();
      if (t.k === 'word' && toks[p + 1] && isOp(toks[p + 1], '(') && isOp(toks[p + 2], ')') && /^[A-Za-z_][\w.-]*$/.test(t.raw)) {
        p += 3; skipNewlines();
        const body = parseCommand();
        return { type: 'compound', kind: 'function', name: t.raw, body };
      }
      return parseSimple(terms);
    }

    function condList(until) {
      const l = parseList(x => until.some(u => isKw(x, u)));
      return l;
    }

    function expectKw(v, openTok) {
      if (!isKw(peek(), v)) throw new ParseError('Falta «' + v + '»', openTok ? openTok.start : src.length);
      p++;
    }

    function readArithCommand(t) {
      let depth = 2, j = t.start + 2;
      while (j < src.length && depth > 0) { if (src[j] === '(') depth++; else if (src[j] === ')') depth--; j++; }
      if (depth !== 0 || src[j - 2] !== ')') return null;
      const expr = src.slice(t.start + 2, j - 2);
      while (p < toks.length && toks[p].start < j) p++;
      const node = { type: 'compound', kind: 'arith', expr, redirs: [] };
      return node;
    }

    function parseIf() {
      const open = next();
      const branches = [];
      let cond = condList(['then']); expectKw('then', open);
      let body = condList(['elif', 'else', 'fi']);
      branches.push({ cond, body });
      let els = null;
      while (isKw(peek(), 'elif')) {
        p++; cond = condList(['then']); expectKw('then', open); body = condList(['elif', 'else', 'fi']);
        branches.push({ cond, body });
      }
      if (isKw(peek(), 'else')) { p++; els = condList(['fi']); }
      expectKw('fi', open);
      const node = { type: 'compound', kind: 'if', branches, else: els, redirs: [] };
      parseRedirs(node); return node;
    }

    function parseFor(kind) {
      const open = next();
      let items = null, arith = null, v = null;
      if (isOp(peek(), '(') && toks[p + 1] && isOp(toks[p + 1], '(')) {
        const a = readArithCommand(peek());
        if (!a) throw new ParseError('Cabecera «for ((…))» mal formada', open.end);
        arith = a.expr; v = { raw: '((' + a.expr + '))' };
      } else {
        v = next();
        if (!v || v.k !== 'word') throw new ParseError('Falta la variable del «for»', open.end);
      }
      skipNewlines();
      if (isKw(peek(), 'in')) {
        p++; items = [];
        while (peek() && peek().k === 'word' && !(isOp(peek()))) items.push(next());
      }
      if (peek() && isOp(peek(), ';')) p++;
      skipNewlines();
      expectKw('do', open);
      const body = condList(['done']);
      expectKw('done', open);
      const node = { type: 'compound', kind, varName: v.raw, items, arith, body, redirs: [] };
      parseRedirs(node); return node;
    }

    function parseWhile(kind) {
      const open = next();
      const cond = condList(['do']); expectKw('do', open);
      const body = condList(['done']); expectKw('done', open);
      const node = { type: 'compound', kind, cond, body, redirs: [] };
      parseRedirs(node); return node;
    }

    function parseCase() {
      const open = next();
      const subj = next();
      skipNewlines();
      if (!isKw(peek(), 'in')) throw new ParseError('Falta «in» en el «case»', open.end);
      p++; skipNewlines();
      const clauses = [];
      while (peek() && !isKw(peek(), 'esac')) {
        if (isOp(peek(), '(')) p++;
        const pats = [];
        while (peek() && !isOp(peek(), ')')) {
          const w = next();
          if (w.k === 'word') pats.push(w.raw);
          if (isOp(peek(), '|')) p++;
          if (!peek()) throw new ParseError('Falta «)» en el «case»', open.start);
        }
        p++;
        const body = parseList(x => isOp(x, ';;') || isOp(x, ';&') || isKw(x, 'esac'));
        if (isOp(peek(), ';;') || isOp(peek(), ';&')) p++;
        skipNewlines();
        clauses.push({ pats, body });
      }
      expectKw('esac', open);
      return { type: 'compound', kind: 'case', subject: subj ? subj.raw : '', clauses, redirs: [] };
    }

    function parseFunctionKw() {
      const open = next();
      const nm = next();
      if (isOp(peek(), '(') && isOp(toks[p + 1], ')')) p += 2;
      skipNewlines();
      const body = parseCommand();
      return { type: 'compound', kind: 'function', name: nm ? nm.raw : '?', body };
    }

    function parseDoubleBracket() {
      const open = next();
      const words = [];
      while (peek() && !isKw(peek(), ']]')) {
        if (isOp(peek(), '\n')) throw new ParseError('Falta cerrar «[[»', open.start);
        words.push(next());
      }
      if (!peek()) throw new ParseError('Falta cerrar «[[»', open.start);
      p++;
      return { type: 'compound', kind: 'testbracket', words, redirs: [] };
    }

    function parseSimple(terms) {
      const node = { type: 'command', assigns: [], words: [], redirs: [], start: peek().start };
      let seenWord = false;
      while (peek()) {
        const t = peek();
        if (t.k === 'comment') { p++; continue; }
        if (t.k === 'op') {
          if (/^(>>|>&|>\||>|<&|<<<|<<-|<<|<>|<|&>>|&>)$/.test(t.v)) { parseRedirs(node); continue; }
          break;
        }
        if (!seenWord) {
          const m = /^([A-Za-z_][A-Za-z0-9_]*)(\+?=)/.exec(t.raw);
          if (m && t.parts[0] && t.parts[0].t === 'lit') {
            p++; node.assigns.push({ name: m[1], op: m[2], token: t, raw: t.raw }); continue;
          }
        }
        seenWord = true;
        p++;
        node.words.push(t);
      }
      node.end = toks[p - 1] ? toks[p - 1].end : node.start;
      if (!node.words.length && !node.assigns.length && !node.redirs.length) {
        throw new ParseError('Comando vacío', node.start);
      }
      return node;
    }

    const tree = parseList(null);
    if (p < toks.length) {
      const t = toks[p];
      throw new ParseError('Símbolo inesperado «' + (t.v || t.raw) + '»', t.start);
    }
    return tree;
  }

  /* Ayudas públicas */
  function tryParse(src) {
    try { return { ok: true, tree: parse(src) }; }
    catch (e) { if (e instanceof ParseError) return { ok: false, error: e.message, pos: e.pos }; throw e; }
  }

  const api = { tokenize, parse, tryParse, wordText, literalValue, plainLiteral, hasExpansion, isQuotedWhole, ParseError, RESERVED };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ShellParser = api;
})(typeof self !== 'undefined' ? self : this);
