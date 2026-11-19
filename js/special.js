/* CmdLens · explicadores especiales por comando (chmod, find, sed, dd, regex, envolturas…). */
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const REG = {};

  /* ---------- envolturas: comandos que ejecutan otro comando ---------- */
  const WRAP = {
    sudo: { skip: 0, es: 'Ejecuta el comando interno con los privilegios de otro usuario (por defecto root).', en: 'Runs the inner command with another user\'s privileges (root by default).', effects: ['priv'] },
    doas: { skip: 0, es: 'Ejecuta el comando interno como otro usuario (alternativa ligera a sudo).', en: 'Runs the inner command as another user (lightweight sudo alternative).', effects: ['priv'] },
    pkexec: { skip: 0, es: 'Ejecuta el comando interno con privilegios (PolicyKit).', en: 'Runs the inner command with privileges (PolicyKit).', effects: ['priv'] },
    env: { skip: 0, assigns: true, es: 'Ejecuta el comando interno con variables de entorno modificadas.', en: 'Runs the inner command with a modified environment.' },
    nohup: { skip: 0, es: 'Ejecuta el comando interno ignorando el cierre de la terminal (sigue vivo al desconectar).', en: 'Runs the inner command immune to hangups (survives logout).' },
    nice: { skip: 0, es: 'Ejecuta el comando interno con otra prioridad de CPU.', en: 'Runs the inner command with a different CPU priority.' },
    ionice: { skip: 0, es: 'Ejecuta el comando interno con otra prioridad de disco.', en: 'Runs the inner command with a different I/O priority.' },
    time: { skip: 0, es: 'Ejecuta el comando interno y mide cuánto tarda.', en: 'Runs the inner command and measures how long it takes.' },
    timeout: { skip: 1, es: 'Ejecuta el comando interno y lo mata si supera el tiempo indicado.', en: 'Runs the inner command and kills it if it exceeds the given time.' },
    watch: { skip: 0, es: 'Repite el comando interno cada cierto tiempo y muestra su salida en pantalla completa.', en: 'Repeats the inner command periodically and shows its output full screen.' },
    xargs: { skip: 0, es: 'Construye y ejecuta el comando interno usando como argumentos lo que llega por la entrada estándar.', en: 'Builds and runs the inner command using standard input as its arguments.' },
    exec: { skip: 0, es: 'REEMPLAZA la shell actual por el comando interno (la shell deja de existir).', en: 'REPLACES the current shell with the inner command (the shell no longer exists).' },
    command: { skip: 0, es: 'Ejecuta el comando interno saltándose alias y funciones de la shell.', en: 'Runs the inner command bypassing shell aliases and functions.' },
    builtin: { skip: 0, es: 'Ejecuta el comando interno como orden interna de bash.', en: 'Runs the inner command as a bash builtin.' },
    stdbuf: { skip: 0, es: 'Ejecuta el comando interno cambiando el búfer de sus flujos.', en: 'Runs the inner command with modified stream buffering.' },
    setsid: { skip: 0, es: 'Ejecuta el comando interno en una sesión nueva, desligado de la terminal.', en: 'Runs the inner command in a new session, detached from the terminal.' },
    strace: { skip: 0, es: 'Ejecuta el comando interno y muestra todas sus llamadas al sistema.', en: 'Runs the inner command and prints every system call it makes.' },
    ltrace: { skip: 0, es: 'Ejecuta el comando interno y muestra sus llamadas a bibliotecas.', en: 'Runs the inner command and prints its library calls.' },
    chroot: { skip: 1, es: 'Ejecuta el comando interno con otro directorio como raíz del sistema.', en: 'Runs the inner command with a different root directory.', effects: ['priv'] },
    taskset: { skip: 1, es: 'Ejecuta el comando interno fijándolo a ciertos núcleos de CPU.', en: 'Runs the inner command pinned to specific CPU cores.' },
    unbuffer: { skip: 0, es: 'Ejecuta el comando interno sin búfer de salida.', en: 'Runs the inner command without output buffering.' },
    runuser: { skip: 0, es: 'Ejecuta el comando interno como otro usuario.', en: 'Runs the inner command as another user.', effects: ['priv'] },
    proxychains: { skip: 0, es: 'Ejecuta el comando interno haciendo pasar sus conexiones por proxies.', en: 'Runs the inner command routing its connections through proxies.', effects: ['net'] },
    proxychains4: { skip: 0, es: 'Ejecuta el comando interno haciendo pasar sus conexiones por proxies.', en: 'Runs the inner command routing its connections through proxies.', effects: ['net'] },
    torify: { skip: 0, es: 'Ejecuta el comando interno enrutando su tráfico por Tor.', en: 'Runs the inner command routing its traffic through Tor.', effects: ['net'] },
    torsocks: { skip: 0, es: 'Ejecuta el comando interno enrutando su tráfico por Tor.', en: 'Runs the inner command routing its traffic through Tor.', effects: ['net'] },
  };
  const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'ash', 'fish', 'csh', 'tcsh', 'rbash']);

  function wrapper(name, unit, ops, T, lang) {
    const w = WRAP[name];
    if (!w) return null;
    if (name === 'command' && (unit.opts.has('-v') || unit.opts.has('-V'))) return null;
    if (name === 'sudo' && (unit.opts.has('-l') || unit.opts.has('-v') || unit.opts.has('-k') || unit.opts.has('-K') || unit.opts.has('-e'))) return null;
    if (name === 'xargs' || name === 'watch') { /* ok */ }
    if (name === 'time' && ops.length === 0) return null;
    return { kind: 'argv', index: w.skip, label: lang === 'en' ? 'Inner command' : 'Comando interno', desc: lang === 'en' ? w.en : w.es, assigns: w.assigns, effects: w.effects };
  }

  /* ---------- regex ---------- */
  const POSIX = { alpha: 'letras', digit: 'dígitos', alnum: 'letras y dígitos', upper: 'mayúsculas', lower: 'minúsculas', space: 'espacios en blanco', punct: 'signos de puntuación', blank: 'espacio o tabulador', xdigit: 'dígitos hexadecimales', cntrl: 'caracteres de control', print: 'imprimibles', graph: 'visibles' };
  const POSIX_EN = { alpha: 'letters', digit: 'digits', alnum: 'letters and digits', upper: 'uppercase letters', lower: 'lowercase letters', space: 'whitespace', punct: 'punctuation', blank: 'space or tab', xdigit: 'hex digits', cntrl: 'control characters', print: 'printable characters', graph: 'visible characters' };

  function explainRegex(pat, flavor, T) { // flavor: 'bre' | 'ere' | 'pcre'
    const out = [];
    const ere = flavor !== 'bre';
    let i = 0, lit = '';
    const flush = () => { if (lit) { out.push({ label: lit, desc: lit.length === 1 ? T('El carácter «' + lit + '» tal cual.', 'The character "' + lit + '" as is.') : T('El texto «' + lit + '» tal cual.', 'The text "' + lit + '" as is.') }); lit = ''; } };
    const push = (label, desc) => { flush(); out.push({ label, desc }); };
    while (i < pat.length && out.length < 60) {
      const c = pat[i];
      if (c === '\\' && i + 1 < pat.length) {
        const n = pat[i + 1];
        let handled = true;
        if (!ere && n === '(') push('\\(', T('Abre un grupo (captura lo que case dentro).', 'Opens a group (captures what matches inside).'));
        else if (!ere && n === ')') push('\\)', T('Cierra el grupo.', 'Closes the group.'));
        else if (!ere && n === '|') push('\\|', T('«O»: acepta lo de la izquierda o lo de la derecha.', '"OR": accepts the left or the right side.'));
        else if (!ere && (n === '+' || n === '?')) push('\\' + n, n === '+' ? T('Uno o más del elemento anterior.', 'One or more of the previous item.') : T('Cero o uno del elemento anterior (opcional).', 'Zero or one of the previous item (optional).'));
        else if (!ere && n === '{') { const m = /^\\\{([0-9,]*)\\\}/.exec(pat.slice(i)); if (m) { push(m[0], quantDesc(m[1], T)); i += m[0].length; continue; } handled = false; }
        else if (n === 'd' && flavor === 'pcre') push('\\d', T('Un dígito (0-9).', 'A digit (0-9).'));
        else if (n === 'D' && flavor === 'pcre') push('\\D', T('Cualquier cosa que NO sea un dígito.', 'Anything that is NOT a digit.'));
        else if (n === 'w') push('\\w', T('Carácter de palabra: letra, dígito o «_».', 'Word character: letter, digit or "_".'));
        else if (n === 'W') push('\\W', T('Carácter que NO es de palabra.', 'Non-word character.'));
        else if (n === 's') push('\\s', T('Espacio en blanco (espacio, tabulador, salto de línea).', 'Whitespace (space, tab, newline).'));
        else if (n === 'S') push('\\S', T('Cualquier carácter que no sea un espacio en blanco.', 'Any non-whitespace character.'));
        else if (n === 'b') push('\\b', T('Límite de palabra (inicio o fin de una palabra).', 'Word boundary (start or end of a word).'));
        else if (n === '<') push('\\<', T('Inicio de palabra.', 'Start of a word.'));
        else if (n === '>') push('\\>', T('Fin de palabra.', 'End of a word.'));
        else if (n === 'n') push('\\n', T('Salto de línea.', 'Newline.'));
        else if (n === 't') push('\\t', T('Tabulador.', 'Tab.'));
        else if (/[1-9]/.test(n)) push('\\' + n, T('Repite lo que capturó el grupo número ' + n + '.', 'Repeats what group number ' + n + ' captured.'));
        else if ('.^$*+?()[]{}|\\/-'.includes(n)) push('\\' + n, T('El carácter «' + n + '» literal (escapado, sin significado especial).', 'The literal "' + n + '" character (escaped, no special meaning).'));
        else handled = false;
        if (handled) { i += 2; continue; }
        lit += n; i += 2; continue;
      }
      if (c === '^') { push('^', T('Inicio de línea.', 'Start of line.')); i++; continue; }
      if (c === '$') { push('$', T('Fin de línea.', 'End of line.')); i++; continue; }
      if (c === '.') { push('.', T('Cualquier carácter (uno).', 'Any single character.')); i++; continue; }
      if (c === '*') { push('*', T('Cero o más veces el elemento anterior.', 'Zero or more of the previous item.')); i++; continue; }
      if (ere && c === '+') { push('+', T('Una o más veces el elemento anterior.', 'One or more of the previous item.')); i++; continue; }
      if (ere && c === '?') { push('?', T('Cero o una vez el elemento anterior (opcional).', 'Zero or one of the previous item (optional).')); i++; continue; }
      if (ere && c === '|') { push('|', T('«O»: acepta lo de la izquierda o lo de la derecha.', '"OR": accepts the left or the right side.')); i++; continue; }
      if (ere && c === '(') {
        if (flavor === 'pcre' && pat.startsWith('(?:', i)) { push('(?:', T('Abre un grupo sin captura.', 'Opens a non-capturing group.')); i += 3; continue; }
        if (flavor === 'pcre' && /^\(\?(=|!|<=|<!)/.test(pat.slice(i))) { const m = /^\(\?(=|!|<=|<!)/.exec(pat.slice(i)); const d = { '=': T('Mira hacia delante: debe seguir…', 'Lookahead: must be followed by…'), '!': T('Mira hacia delante: NO debe seguir…', 'Negative lookahead: must NOT be followed by…'), '<=': T('Mira hacia atrás: debe preceder…', 'Lookbehind: must be preceded by…'), '<!': T('Mira hacia atrás: NO debe preceder…', 'Negative lookbehind: must NOT be preceded by…') }[m[1]]; push(m[0], d); i += m[0].length; continue; }
        push('(', T('Abre un grupo (captura lo que case dentro).', 'Opens a group (captures what matches inside).')); i++; continue;
      }
      if (ere && c === ')') { push(')', T('Cierra el grupo.', 'Closes the group.')); i++; continue; }
      if (ere && c === '{') { const m = /^\{([0-9]*,?[0-9]*)\}/.exec(pat.slice(i)); if (m) { push(m[0], quantDesc(m[1], T)); i += m[0].length; continue; } }
      if (c === '[') {
        let j = i + 1; if (pat[j] === '^') j++; if (pat[j] === ']') j++;
        while (j < pat.length && pat[j] !== ']') { if (pat[j] === '[' && pat[j + 1] === ':') { const e = pat.indexOf(':]', j); j = e > 0 ? e + 2 : j + 1; } else j++; }
        const cls = pat.slice(i, j + 1);
        if (pat[j] !== ']') { lit += c; i++; continue; }
        const neg = cls[1] === '^';
        let inner = cls.slice(neg ? 2 : 1, -1);
        const parts = [];
        inner = inner.replace(/\[:(\w+):\]/g, (_, k) => { parts.push(T(POSIX[k] || k, POSIX_EN[k] || k)); return ''; });
        const rng = []; const re = /(.)-(.)/g; let mm;
        inner = inner.replace(re, (_, a, b) => { rng.push(a + '–' + b); return ''; });
        if (inner) parts.push(T('los caracteres «' + inner + '»', 'the characters "' + inner + '"'));
        if (rng.length) parts.push(T('el rango ', 'the range ') + rng.join(', '));
        push(cls, (neg ? T('Un carácter que NO sea: ', 'One character that is NOT: ') : T('Uno de estos: ', 'One of these: ')) + parts.join('; ') + '.');
        i = j + 1; continue;
      }
      lit += c; i++;
    }
    flush();
    return out;
  }
  function quantDesc(q, T) {
    const m = /^(\d*)(,?)(\d*)$/.exec(q);
    if (!m) return T('Cantidad de repeticiones.', 'Repetition count.');
    if (!m[2]) return T('Exactamente ' + m[1] + ' veces el elemento anterior.', 'Exactly ' + m[1] + ' of the previous item.');
    if (!m[3]) return T('Al menos ' + (m[1] || 0) + ' veces el elemento anterior.', 'At least ' + (m[1] || 0) + ' of the previous item.');
    return T('Entre ' + (m[1] || 0) + ' y ' + m[3] + ' veces el elemento anterior.', 'Between ' + (m[1] || 0) + ' and ' + m[3] + ' of the previous item.');
  }

  /* ---------- permisos ---------- */
  function rwx(n, T) { return [n & 4 ? T('leer', 'read') : '', n & 2 ? T('escribir', 'write') : '', n & 1 ? T('ejecutar', 'execute') : ''].filter(Boolean).join(' + ') || T('ningún permiso', 'no permissions'); }
  function rwxStr(n) { return (n & 4 ? 'r' : '-') + (n & 2 ? 'w' : '-') + (n & 1 ? 'x' : '-'); }

  function explainMode(mode, T, isDir) {
    const items = [];
    if (/^[0-7]{1,4}$/.test(mode)) {
      const m = mode.padStart(4, '0');
      const [sp, u, g, o] = [+m[0], +m[1], +m[2], +m[3]];
      items.push({ label: mode, desc: T('Modo numérico (octal): cada cifra es la suma de leer=4, escribir=2, ejecutar=1.', 'Numeric (octal) mode: each digit is the sum of read=4, write=2, execute=1.') + ' → ' + rwxStr(u) + rwxStr(g) + rwxStr(o) });
      items.push({ label: T('propietario', 'owner') + ' ' + u, desc: rwx(u, T) });
      items.push({ label: T('grupo', 'group') + ' ' + g, desc: rwx(g, T) });
      items.push({ label: T('resto del mundo', 'others') + ' ' + o, desc: rwx(o, T) });
      if (sp & 4) items.push({ label: 'setuid', desc: T('El programa se ejecuta con los privilegios de su PROPIETARIO (peligroso si es root: vía clásica de escalada).', 'The program runs with its OWNER\'s privileges (dangerous if root: a classic escalation path).') });
      if (sp & 2) items.push({ label: 'setgid', desc: T('Se ejecuta con los privilegios de su grupo (en directorios, lo creado hereda el grupo).', 'Runs with its group\'s privileges (on directories, new files inherit the group).') });
      if (sp & 1) items.push({ label: 'sticky', desc: T('Bit pegajoso: en un directorio, solo el dueño de cada archivo puede borrarlo (como /tmp).', 'Sticky bit: in a directory, only each file\'s owner can delete it (like /tmp).') });
      return { items, o: (u << 6) | (g << 3) | o, special: sp };
    }
    const m = /^([ugoa]*)([-+=])([rwxXst]*|[ugo])$/;
    for (const clause of mode.split(',')) {
      const mm = m.exec(clause);
      if (!mm) { items.push({ label: clause, desc: T('Cláusula de permisos no reconocida.', 'Unrecognised permission clause.') }); continue; }
      const who = mm[1] || 'a';
      const whoTxt = [...who].map(x => ({ u: T('propietario', 'owner'), g: T('grupo', 'group'), o: T('resto', 'others'), a: T('todos', 'everyone') }[x])).join(' + ');
      const op = { '+': T('AÑADE', 'ADDS'), '-': T('QUITA', 'REMOVES'), '=': T('FIJA exactamente', 'SETS exactly') }[mm[2]];
      const what = [...mm[3]].map(x => ({ r: T('leer', 'read'), w: T('escribir', 'write'), x: T('ejecutar', 'execute'), X: T('ejecutar (solo directorios o ya ejecutables)', 'execute (only dirs or already executable)'), s: 'setuid/setgid', t: 'sticky' }[x] || T('los permisos de «' + x + '»', 'the permissions of "' + x + '"'))).join(' + ');
      items.push({ label: clause, desc: op + ' ' + (what || T('ningún permiso', 'no permissions')) + T(' para ', ' for ') + whoTxt + '.' });
    }
    return { items, symbolic: true };
  }

  /* ---------- sed ---------- */
  function explainSed(script, T, flavor) {
    const out = [];
    let i = 0; const n = script.length;
    const skipWs = () => { while (i < n && /[ \t\n;]/.test(script[i])) i++; };
    function readDelim(d) { let s = ''; while (i < n && script[i] !== d) { if (script[i] === '\\' && i + 1 < n) { s += script[i] + script[i + 1]; i += 2; } else s += script[i++]; } i++; return s; }
    while (i < n && out.length < 25) {
      skipWs(); if (i >= n) break;
      const st = i;
      let addr = '';
      // direcciones
      for (let k = 0; k < 2; k++) {
        const m = /^(\d+(~\d+)?|\$|\/(?:\\.|[^\/])*\/[IM]*|\\(.)(?:.*?)\3)/.exec(script.slice(i));
        if (!m) break;
        addr += (k ? ',' : '') + m[0]; i += m[0].length;
        if (script[i] === ',') i++; else break;
      }
      if (script[i] === '!') { addr += '!'; i++; }
      while (script[i] === ' ') i++;
      const c = script[i++];
      let desc = '', label = '';
      const where = addr ? T('En las líneas «' + addr + '»: ', 'On lines "' + addr + '": ') : T('En todas las líneas: ', 'On every line: ');
      if (c === 's') {
        const d = script[i++]; const re = readDelim(d); const rep = readDelim(d);
        let fl = ''; while (i < n && /[gpiIwe0-9mM]/.test(script[i])) fl += script[i++];
        label = script.slice(st, i);
        const flags = [];
        if (fl.includes('g')) flags.push(T('g = todas las coincidencias de cada línea (sin «g», solo la primera)', 'g = every match in the line (without "g", only the first)'));
        if (/[iI]/.test(fl)) flags.push(T('i = ignora mayúsculas/minúsculas', 'i = ignore case'));
        if (fl.includes('p')) flags.push(T('p = imprime la línea si hubo cambio', 'p = print the line if a change was made'));
        if (/\d/.test(fl)) flags.push(T('N = solo la coincidencia número ' + fl.replace(/\D/g, ''), 'N = only match number ' + fl.replace(/\D/g, '')));
        if (fl.includes('e')) flags.push(T('e = ¡ejecuta el resultado como comando!', 'e = executes the result as a command!'));
        if (fl.includes('w')) flags.push(T('w = escribe las líneas cambiadas en un archivo', 'w = writes changed lines to a file'));
        desc = where + T('sustituye ', 'substitutes ') + '«' + re + '»' + T(' por ', ' with ') + '«' + rep + '»' + (flags.length ? ' — ' + flags.join('; ') : T(' — solo la primera coincidencia de cada línea', ' — first match per line only')) + '.';
        const extra = explainRegex(re, flavor, T);
        out.push({ label, desc, sub: [{ label: T('Patrón buscado', 'Search pattern') + ': ' + re, desc: '' }, ...extra.map(e => ({ label: '   ' + e.label, desc: e.desc })), { label: T('Reemplazo', 'Replacement') + ': ' + rep, desc: /&|\\\d/.test(rep) ? T('«&» = todo lo que casó; «\\1»…«\\9» = lo capturado por los grupos.', '"&" = the whole match; "\\1"…"\\9" = group captures.') : '' }] });
        continue;
      }
      if (c === 'y') { const d = script[i++]; const a = readDelim(d), b = readDelim(d); label = script.slice(st, i); out.push({ label, desc: where + T('traduce carácter a carácter: «' + a + '» → «' + b + '» (como tr).', 'transliterates character by character: "' + a + '" → "' + b + '" (like tr).') }); continue; }
      const simple = {
        d: [T('borra la línea (no llega a imprimirse).', 'deletes the line (it is not printed).')], p: [T('imprime la línea (con -n evita duplicados).', 'prints the line (use with -n to avoid duplicates).')],
        q: [T('imprime y termina el procesamiento.', 'prints and stops processing.')], Q: [T('termina sin imprimir.', 'quits without printing.')], n: [T('pasa a la siguiente línea.', 'moves to the next line.')], N: [T('añade la siguiente línea al espacio de trabajo.', 'appends the next line to the pattern space.')],
        '=': [T('imprime el número de línea.', 'prints the line number.')], l: [T('muestra la línea con los caracteres invisibles escapados.', 'shows the line with invisible characters escaped.')], h: [T('copia la línea al espacio de retención.', 'copies the line to the hold space.')], H: [T('añade la línea al espacio de retención.', 'appends the line to the hold space.')],
        g: [T('recupera el espacio de retención.', 'restores the hold space.')], G: [T('añade el espacio de retención a la línea.', 'appends the hold space to the line.')], x: [T('intercambia línea y espacio de retención.', 'swaps line and hold space.')], '{': [T('abre un bloque de comandos.', 'opens a command block.')], '}': [T('cierra el bloque.', 'closes the block.')],
      };
      if (simple[c]) { out.push({ label: script.slice(st, i), desc: where + simple[c][0] }); continue; }
      if (c === 'a' || c === 'i' || c === 'c') { const txt = script.slice(i).replace(/^\\?\s*/, ''); i = n; out.push({ label: script.slice(st), desc: where + ({ a: T('añade DESPUÉS de la línea el texto «' + txt + '».', 'appends the text "' + txt + '" AFTER the line.'), i: T('inserta ANTES de la línea el texto «' + txt + '».', 'inserts the text "' + txt + '" BEFORE the line.'), c: T('REEMPLAZA la línea por «' + txt + '».', 'REPLACES the line with "' + txt + '".') }[c]) }); break; }
      if (c === 'w' || c === 'r') { const f = script.slice(i).trim(); i = n; out.push({ label: script.slice(st), desc: where + (c === 'w' ? T('escribe la línea en el archivo «' + f + '».', 'writes the line to file "' + f + '".') : T('inserta el contenido del archivo «' + f + '».', 'inserts the contents of file "' + f + '".')) }); break; }
      if (c === 'e') { out.push({ label: script.slice(st), desc: T('¡Ejecuta un comando de shell!', 'Executes a shell command!') }); break; }
      out.push({ label: script.slice(st, i), desc: T('Comando de sed no reconocido por CmdLens (consulta «man sed»).', 'sed command not recognised by CmdLens (see "man sed").') });
      break;
    }
    return out;
  }

  /* ---------- helpers de tokens ---------- */
  function addItems(tok, items) { if (!tok) return; tok.items.push(...items); }
  function findTokByOperand(operandToks, k) { return operandToks[k]; }
  function hasForm(unit, ...fs) { return fs.some(f => unit.opts.has(f)); }
  function optValue(tokens, ...forms) { // valor del argumento de una opción
    for (const t of tokens) if (t.role === 'optarg' && forms.includes(t.forOpt)) return t;
    return null;
  }
  function optValueByForm(pending, ...forms) { return pending.find(p => forms.includes(p.form) || (p.o && p.o.f.some(f => forms.includes(f)))); }

  /* ---------- registro de especiales ---------- */
  REG.chmod = {
    post({ T, unit, operands, operandToks, ws }) {
      if (unit.opts.has('--reference')) return;
      if (!operands.length) return;
      const mode = operands[0].wi.lit;
      if (mode == null) return;
      const r = explainMode(mode, T);
      const tok = operandToks[0];
      tok.items[0] = { label: T('permisos', 'mode'), desc: T('Qué permisos se aplican (modo).', 'Which permissions are applied (mode).') };
      tok.items.push(...r.items);
      unit.modeInfo = r;
      unit.modeText = mode;
      for (let k = 1; k < operandToks.length; k++) operandToks[k].items[0] = { label: T('archivo o directorio', 'file or directory'), desc: T('Objetivo del cambio de permisos.', 'Target of the permission change.') };
    },
  };
  REG.chown = REG.chgrp = {
    post({ T, unit, operands, operandToks, rec }) {
      if (!operands.length || unit.opts.has('--reference')) return;
      const isGrp = rec.n === 'chgrp';
      const spec = operands[0].wi.lit; if (spec == null) return;
      const m = /^([^:.]*)(?:[:.]([^:.]*))?$/.exec(spec);
      const tok = operandToks[0]; if (!m) return;
      tok.items[0] = { label: isGrp ? T('grupo', 'group') : T('propietario[:grupo]', 'owner[:group]'), desc: T('Nuevo dueño.', 'New owner.') };
      if (isGrp) tok.items.push({ label: spec, desc: T('Nuevo grupo propietario.', 'New owning group.') });
      else {
        if (m[1]) tok.items.push({ label: m[1], desc: T('Nuevo usuario propietario.', 'New owning user.') });
        if (m[2] !== undefined && m[2] !== '') tok.items.push({ label: m[2], desc: T('Nuevo grupo propietario.', 'New owning group.') });
        else if (spec.includes(':')) tok.items.push({ label: ':', desc: T('Con «usuario:» sin grupo, el grupo pasa a ser el grupo de login del usuario.', 'With "user:" and no group, the group becomes the user\'s login group.') });
        if (!m[1] && m[2]) tok.items.push({ label: ':' + m[2], desc: T('Solo cambia el grupo; el usuario no se toca.', 'Only the group changes; the user is untouched.') });
      }
      unit.ownerSpec = spec;
      for (let k = 1; k < operandToks.length; k++) operandToks[k].items[0] = { label: T('archivo o directorio', 'file or directory'), desc: T('Objetivo del cambio.', 'Target of the change.') };
    },
  };

  REG.find = {
    async pre({ T, ws, unit, explainWords }) {
      const out = []; const extraToks = [];
      for (let i = 0; i < ws.length; i++) {
        const w = ws[i];
        if (['-exec', '-execdir', '-ok', '-okdir'].includes(w.lit)) {
          let j = i + 1; const inner = [];
          while (j < ws.length && !(ws[j].lit === ';' || ws[j].lit === '+')) inner.push(ws[j++]);
          const term = ws[j];
          const end = term ? term.end : (inner.length ? inner[inner.length - 1].end : w.end);
          const kind = term && term.lit === '+' ? T('UNA sola vez con todos los archivos juntos (terminador «+»)', 'ONCE with all files together (terminator "+")') : T('una vez POR CADA archivo (terminador «\\;»)', 'once PER file (terminator "\\;")');
          const tok = { start: w.start, end, text: '', role: 'opt', items: [{ label: w.lit, desc: T('Ejecuta un comando sobre lo encontrado: ', 'Runs a command on what was found: ') + kind + T('. «{}» se sustituye por el nombre del archivo.', '. "{}" is replaced by the file name.') + (w.lit.endsWith('ok') || w.lit === '-ok' ? T(' Pide confirmación antes de cada ejecución.', ' Asks for confirmation before each run.') : '') }], findExec: true };
          if (inner.length) tok.nested = [await explainWords(inner, T('Comando que ejecuta find', 'Command run by find'))];
          extraToks.push(tok); unit.findExec = unit.findExec || []; unit.findExec.push(inner.map(x => x.text));
          i = j; continue;
        }
        out.push(w);
      }
      return { ws: out, extraToks };
    },
    post({ T, unit, operandToks, special, ctx }) {
      if (special && special.extraToks) for (const t of special.extraToks) { t.text = ctx.src.slice(t.start, t.end); unit.tokens.push(t); }
      const logic = { '(': T('Abre un grupo de condiciones (se escribe «\\(» para que la shell no lo interprete).', 'Opens a group of conditions (written "\\(" so the shell does not interpret it).'), ')': T('Cierra el grupo de condiciones.', 'Closes the group of conditions.'), '!': T('NO: invierte la condición siguiente.', 'NOT: inverts the next condition.') };
      for (const t of operandToks) { const v = t.value; if (v && logic[v]) t.items[0] = { label: v, desc: logic[v] }; }
      for (const t of operandToks) {
        if (t.value && t.items[0] && /ruta|path|start|starting|punto/i.test(t.items[0].label || '')) { /* ok */ }
      }
    },
  };

  REG.sed = {
    post({ T, unit, operands, operandToks, tokens, pending }) {
      const flavor = unit.opts.has('-E') || unit.opts.has('-r') || unit.opts.has('--regexp-extended') ? 'ere' : 'bre';
      const scripts = [];
      for (const p of pending) if (p.o && p.o.f.some(f => f === '-e' || f === '--expression') && p.wi.lit != null) scripts.push({ tok: p.tok, text: p.wi.lit });
      const hasF = unit.opts.has('-f') || unit.opts.has('--file');
      if (!scripts.length && !hasF && operands.length && operands[0].wi.lit != null) { scripts.push({ tok: operandToks[0], text: operands[0].wi.lit, operand: true }); }
      for (const s of scripts) {
        if (s.operand) s.tok.items[0] = { label: T('guion de sed', 'sed script'), desc: T('Las órdenes que sed aplica a cada línea.', 'The commands sed applies to each line.') };
        const parts = explainSed(s.text, T, flavor);
        for (const p of parts) { s.tok.items.push({ label: p.label, desc: p.desc }); if (p.sub) s.tok.items.push(...p.sub.filter(x => x.label.trim()).map(x => ({ label: x.label, desc: x.desc, indent: 1 }))); }
      }
      if (unit.opts.has('-i') || unit.opts.has('--in-place')) { unit.tips.push(T('Con «-i» sed MODIFICA el archivo original. Prueba primero sin -i o con «-i.bak» (crea copia de seguridad).', 'With "-i" sed MODIFIES the original file. Try without -i first, or use "-i.bak" (creates a backup).')); }
    },
  };

  function grepish(flavorOf) {
    return {
      post({ T, unit, operands, operandToks, pending }) {
        const fl = flavorOf(unit);
        const pats = [];
        for (const p of pending) if (p.o && p.o.f.some(f => f === '-e' || f === '--regexp') && p.wi.lit != null) pats.push({ tok: p.tok, text: p.wi.lit });
        if (!pats.length && !unit.opts.has('-f') && !unit.opts.has('--file') && operands.length && operands[0].wi.lit != null) pats.push({ tok: operandToks[0], text: operands[0].wi.lit, operand: true });
        for (const p of pats) {
          if (p.operand) p.tok.items[0] = { label: T('patrón', 'pattern'), desc: T('Lo que se busca en cada línea.', 'What is searched in each line.') };
          if (unit.opts.has('-F') || unit.opts.has('--fixed-strings') || unit.opts.has('-fgrep')) { p.tok.items.push({ label: p.text, desc: T('Con -F el patrón es texto literal, sin caracteres especiales.', 'With -F the pattern is literal text, no special characters.') }); continue; }
          const parts = explainRegex(p.text, fl, T);
          if (parts.length) p.tok.items.push(...parts.map(e => ({ label: e.label, desc: e.desc, indent: 1 })));
        }
      },
    };
  }
  REG.grep = grepish(u => (u.opts.has('-P') || u.opts.has('--perl-regexp')) ? 'pcre' : (u.opts.has('-E') || u.opts.has('--extended-regexp') ? 'ere' : 'bre'));
  REG.egrep = grepish(() => 'ere');
  REG.fgrep = { post() {} };
  REG.pcregrep = grepish(() => 'pcre');

  const DDKEYS = {
    if: ['Archivo o dispositivo de ENTRADA (de dónde lee).', 'INPUT file or device (what it reads from).'], of: ['Archivo o dispositivo de SALIDA (dónde escribe). Si es un disco, sobrescribe su contenido.', 'OUTPUT file or device (where it writes). If it is a disk, its content is overwritten.'],
    bs: ['Tamaño del bloque que lee y escribe cada vez (p. ej. 4M, 1M).', 'Block size read and written at a time (e.g. 4M, 1M).'], ibs: ['Tamaño de bloque de lectura.', 'Read block size.'], obs: ['Tamaño de bloque de escritura.', 'Write block size.'],
    count: ['Copia solo este número de bloques.', 'Copy only this many blocks.'], skip: ['Salta este número de bloques al principio de la ENTRADA.', 'Skip this many blocks at the start of the INPUT.'], seek: ['Salta este número de bloques al principio de la SALIDA.', 'Skip this many blocks at the start of the OUTPUT.'],
    conv: ['Conversiones: notrunc (no recortar la salida), sync (rellenar), noerror (seguir tras errores), fsync (vaciar al terminar)…', 'Conversions: notrunc (do not truncate output), sync (pad), noerror (continue after errors), fsync (flush at end)…'],
    status: ['Nivel de información: «progress» muestra el avance en vivo, «none» no muestra nada.', 'Information level: "progress" shows live progress, "none" shows nothing.'], oflag: ['Opciones de escritura: direct, sync, append…', 'Output flags: direct, sync, append…'], iflag: ['Opciones de lectura: direct, fullblock…', 'Input flags: direct, fullblock…'],
  };
  REG.dd = {
    post({ T, lang, unit, operandToks }) {
      for (const t of operandToks) {
        const m = /^([a-z]+)=(.*)$/s.exec(t.value || t.text);
        if (!m) continue;
        const d = DDKEYS[m[1]];
        t.items[0] = { label: m[1] + '=', desc: d ? (lang === 'es' ? d[0] : d[1]) : T('Operando desconocido.', 'Unknown operand.') };
        if (m[1] === 'if' && /^\/dev\/(zero|random|urandom)$/.test(m[2])) t.items.push({ label: m[2], desc: m[2] === '/dev/zero' ? T('Fuente infinita de ceros.', 'Infinite source of zero bytes.') : T('Fuente de bytes aleatorios.', 'Source of random bytes.') });
        if (m[1] === 'of' && /^\/dev\/(sd|nvme|hd|vd|mmcblk|disk)/.test(m[2])) t.items.push({ label: m[2], desc: T('¡Dispositivo de bloque completo! Todo lo que había en él se perderá.', 'Whole block device! Everything on it will be lost.') });
        unit.dd = unit.dd || {}; unit.dd[m[1]] = m[2];
      }
    },
  };

  const SIGNALS = { 1: 'HUP (reiniciar/recargar configuración)', 2: 'INT (como Ctrl+C)', 3: 'QUIT (terminar con volcado)', 9: 'KILL (muerte inmediata, no se puede ignorar ni limpiar)', 15: 'TERM (petición educada de terminar; es la señal por defecto)', 18: 'CONT (continuar)', 19: 'STOP (pausar, no se puede ignorar)', 20: 'TSTP (pausar, como Ctrl+Z)', 10: 'USR1', 12: 'USR2', 17: 'CHLD', 0: 'señal 0: no hace nada, solo comprueba si el proceso existe' };
  const SIGNALS_EN = { 1: 'HUP (reload configuration)', 2: 'INT (like Ctrl+C)', 3: 'QUIT (terminate with core dump)', 9: 'KILL (immediate kill, cannot be ignored or cleaned up)', 15: 'TERM (polite request to terminate; the default)', 18: 'CONT (continue)', 19: 'STOP (pause, cannot be ignored)', 20: 'TSTP (pause, like Ctrl+Z)', 10: 'USR1', 12: 'USR2', 17: 'CHLD', 0: 'signal 0: does nothing, only checks the process exists' };
  const SIGNAMES = { HUP: 1, INT: 2, QUIT: 3, KILL: 9, USR1: 10, USR2: 12, TERM: 15, CONT: 18, STOP: 19, TSTP: 20, CHLD: 17 };
  REG.kill = REG.killall = REG.pkill = {
    post({ T, lang, unit, ws, tokens }) {
      for (const t of tokens) {
        const m = /^-(\d+|[A-Z0-9]+)$/.exec(t.text);
        if (!m) continue;
        const num = /^\d+$/.test(m[1]) ? +m[1] : SIGNAMES[m[1].replace(/^SIG/, '')];
        if (num === undefined) continue;
        const d = (lang === 'es' ? SIGNALS : SIGNALS_EN)[num];
        t.items = [{ label: t.text, desc: T('Señal que se envía al proceso: ', 'Signal sent to the process: ') + (d || (T('señal número ', 'signal number ') + num)) + '.' }];
        unit.signal = num;
      }
    },
  };

  REG.chmodX = null;

  function stringShell(label) {
    return {
      async post({ T, unit, operands, operandToks, tokens, pending, explainSource }) {
        const hasC = [...unit.opts].some(f => f === '-c');
        if (!hasC) return;
        // el guion es el valor de -c si lo consumió como argumento, o el primer operando
        let wi = null, tok = null;
        const pa = pending.find(p => p.o && p.o.f.includes('-c'));
        if (pa && pa.wi) { wi = pa.wi; tok = pa.tok; }
        else if (operands.length) { wi = operands[0].wi; tok = operandToks[0]; }
        if (!wi || !tok) return;
        tok.items.unshift({ label: T('guion a ejecutar', 'script to run'), desc: T('Texto que la nueva shell interpreta y ejecuta como comandos.', 'Text the new shell interprets and runs as commands.') });
        if (wi.lit != null) tok.nested = (tok.nested || []).concat([await explainSource(wi.lit, T('Lo que ejecuta ' + unit.name + ' -c', 'What ' + unit.name + ' -c runs'))]);
        else tok.items.push({ label: '!', desc: T('El texto se calcula dinámicamente: no se puede analizar sin ejecutarlo.', 'The text is computed dynamically: it cannot be analysed without running it.') });
        unit.effects.add('exec');
      },
    };
  }
  for (const s of SHELLS) REG[s] = stringShell();
  REG.su = {
    async post({ T, unit, pending, explainSource }) {
      const pa = pending.find(p => p.o && (p.o.f.includes('-c') || p.o.f.includes('--command')));
      if (!pa || !pa.wi || pa.wi.lit == null || !pa.tok) return;
      pa.tok.nested = (pa.tok.nested || []).concat([await explainSource(pa.wi.lit, T('Lo que ejecuta su -c', 'What su -c runs'))]);
      unit.effects.add('priv'); unit.effects.add('exec');
    },
  };
  REG.eval = {
    async post({ T, unit, operands, operandToks, explainSource }) {
      if (!operands.length) return;
      const all = operands.map(o => o.wi);
      if (all.some(w => w.lit == null)) {
        operandToks[0].items.push({ label: '!', desc: T('«eval» ejecuta el resultado de una expansión dinámica: no se puede saber qué hará sin ejecutarlo. Es peligroso con datos externos.', '"eval" runs the result of a dynamic expansion: you cannot know what it will do without running it. Dangerous with external data.') });
        unit.dynamicEval = true; return;
      }
      operandToks[0].nested = [await explainSource(all.map(w => w.lit).join(' '), T('Lo que ejecuta eval', 'What eval runs'))];
      unit.effects.add('exec');
    },
  };
  REG.ssh = {
    async post({ T, unit, operands, operandToks, explainSource }) {
      if (!operands.length) return;
      const dest = operands[0].wi.lit;
      const tk = operandToks[0];
      tk.items[0] = { label: T('destino', 'destination'), desc: T('Equipo al que se conecta, con usuario opcional.', 'Host to connect to, with optional user.') };
      if (dest) {
        const m = /^(?:([^@]+)@)?([^:]+?)(?::(\d+))?$/.exec(dest);
        if (m) {
          if (m[1]) tk.items.push({ label: m[1], desc: T('Usuario con el que se entra en el equipo remoto.', 'User to log in as on the remote host.') });
          tk.items.push({ label: m[2], desc: T('Equipo remoto (nombre DNS o dirección IP).', 'Remote host (DNS name or IP address).') });
          unit.sshHost = m[2]; unit.sshUser = m[1];
        }
      }
      unit.effects.add('net');
      if (operands.length > 1) {
        const rest = operands.slice(1).map(o => o.wi);
        if (rest.every(w => w.lit != null)) {
          const cmd = rest.map(w => w.lit).join(' ');
          operandToks[1].nested = [await explainSource(cmd, T('Se ejecuta en el equipo remoto', 'Runs on the remote host'))];
          unit.effects.add('exec');
          operandToks[1].items[0] = { label: T('comando remoto', 'remote command'), desc: T('En vez de abrir una sesión interactiva, ejecuta esto en el equipo remoto y vuelve.', 'Instead of an interactive session, runs this on the remote host and returns.') };
          for (let k = 2; k < operandToks.length; k++) { operandToks[k].hidden = true; }
        }
      }
    },
  };
  REG.scp = REG.rsync = {
    post({ T, unit, operands, operandToks }) {
      let remote = false;
      operands.forEach((o, k) => {
        const m = /^(?:([^@\/]+)@)?([A-Za-z0-9_.\-\[\]:]+?):(.*)$/.exec(o.wi.lit || '');
        if (m && !/^[A-Za-z]:[\\/]/.test(o.wi.lit)) {
          remote = true;
          operandToks[k].items.push({ label: T('ruta remota', 'remote path'), desc: (m[1] ? T('usuario «' + m[1] + '» en ', 'user "' + m[1] + '" on ') : '') + T('equipo «' + m[2] + '», ruta «' + (m[3] || '~') + '».', 'host "' + m[2] + '", path "' + (m[3] || '~') + '".') });
        }
      });
      if (remote) unit.effects.add('net');
    },
  };

  const TEST_OPS = {
    '-e': ['el archivo existe', 'file exists'], '-f': ['es un archivo normal', 'is a regular file'], '-d': ['es un directorio', 'is a directory'], '-L': ['es un enlace simbólico', 'is a symbolic link'], '-h': ['es un enlace simbólico', 'is a symbolic link'],
    '-r': ['se puede leer', 'is readable'], '-w': ['se puede escribir', 'is writable'], '-x': ['se puede ejecutar', 'is executable'], '-s': ['existe y no está vacío', 'exists and is not empty'], '-z': ['la cadena está vacía', 'string is empty'], '-n': ['la cadena NO está vacía', 'string is NOT empty'],
    '-b': ['es un dispositivo de bloques', 'is a block device'], '-c': ['es un dispositivo de caracteres', 'is a character device'], '-p': ['es una tubería con nombre', 'is a named pipe'], '-S': ['es un socket', 'is a socket'], '-u': ['tiene el bit setuid', 'has the setuid bit'], '-g': ['tiene el bit setgid', 'has the setgid bit'], '-O': ['eres su propietario', 'you own it'], '-G': ['pertenece a tu grupo', 'belongs to your group'], '-t': ['el descriptor es una terminal', 'descriptor is a terminal'],
    '=': ['las cadenas son iguales', 'strings are equal'], '==': ['las cadenas son iguales (en [[ ]] admite patrones)', 'strings are equal (patterns in [[ ]])'], '!=': ['las cadenas son distintas', 'strings differ'], '=~': ['la cadena casa con la expresión regular', 'string matches the regular expression'],
    '-eq': ['números iguales', 'numbers equal'], '-ne': ['números distintos', 'numbers differ'], '-lt': ['menor que', 'less than'], '-le': ['menor o igual', 'less or equal'], '-gt': ['mayor que', 'greater than'], '-ge': ['mayor o igual', 'greater or equal'], '-nt': ['más nuevo que', 'newer than'], '-ot': ['más antiguo que', 'older than'],
    '&&': ['Y', 'AND'], '||': ['O', 'OR'], '!': ['NO', 'NOT'], '-a': ['Y', 'AND'], '-o': ['O', 'OR'], '<': ['va antes (orden alfabético)', 'sorts before'], '>': ['va después (orden alfabético)', 'sorts after'],
  };
  REG.test = REG['['] = {
    post({ T, lang, unit, operandToks }) {
      for (const t of operandToks) {
        const d = TEST_OPS[t.value];
        if (d) t.items[0] = { label: t.value, desc: lang === 'es' ? 'Prueba: ' + d[0] + '.' : 'Test: ' + d[1] + '.' };
        else if (t.value === ']') t.items[0] = { label: ']', desc: T('Cierra la prueba «[ … ]».', 'Closes the "[ … ]" test.') };
      }
    },
  };

  REG.date = {
    post({ T, operandToks }) {
      for (const t of operandToks) {
        if (t.value && t.value[0] === '+') {
          const map = { Y: ['año con 4 cifras', '4-digit year'], y: ['año con 2 cifras', '2-digit year'], m: ['mes (01-12)', 'month (01-12)'], d: ['día del mes (01-31)', 'day of month (01-31)'], H: ['hora (00-23)', 'hour (00-23)'], M: ['minuto (00-59)', 'minute (00-59)'], S: ['segundo (00-60)', 'second (00-60)'], s: ['segundos desde 1970 (epoch)', 'seconds since 1970 (epoch)'], F: ['fecha completa AAAA-MM-DD', 'full date YYYY-MM-DD'], T: ['hora completa HH:MM:SS', 'full time HH:MM:SS'], A: ['nombre del día', 'weekday name'], B: ['nombre del mes', 'month name'], j: ['día del año', 'day of year'], u: ['día de la semana (1=lunes)', 'weekday (1=Monday)'], Z: ['zona horaria', 'time zone'], N: ['nanosegundos', 'nanoseconds'] };
          const seen = new Set();
          for (const m of t.value.matchAll(/%([A-Za-z])/g)) { if (seen.has(m[1]) || !map[m[1]]) continue; seen.add(m[1]); t.items.push({ label: '%' + m[1], desc: T(map[m[1]][0], map[m[1]][1]) }); }
          t.items[0] = { label: T('formato', 'format'), desc: T('Cómo se escribe la fecha: cada «%X» se sustituye por un dato.', 'How the date is written: each "%X" is replaced by a field.') };
        }
      }
    },
  };


  const RRTYPES = new Set(['A', 'AAAA', 'MX', 'NS', 'TXT', 'CNAME', 'SOA', 'PTR', 'SRV', 'CAA', 'ANY', 'AXFR', 'DNSKEY', 'DS', 'RRSIG', 'NAPTR', 'TLSA']);
  REG.dig = {
    post({ T, unit, operandToks }) {
      for (const t of operandToks) {
        const v = t.value || '';
        if (v[0] === '@') t.items[0] = { label: T('servidor DNS', 'DNS server'), desc: T('Servidor al que se hace la consulta («' + v.slice(1) + '») en vez del configurado en el sistema.', 'Server to query ("' + v.slice(1) + '") instead of the system-configured one.') };
        else if (RRTYPES.has(v.toUpperCase())) t.items[0] = { label: T('tipo de registro', 'record type'), desc: ({ A: T('direcciones IPv4', 'IPv4 addresses'), AAAA: T('direcciones IPv6', 'IPv6 addresses'), MX: T('servidores de correo', 'mail servers'), NS: T('servidores de nombres', 'name servers'), TXT: T('textos (SPF, DKIM, verificaciones…)', 'text records (SPF, DKIM, verifications…)'), CNAME: T('alias de otro nombre', 'alias of another name'), SOA: T('inicio de autoridad de la zona', 'zone start of authority'), PTR: T('nombre inverso de una IP', 'reverse name of an IP'), ANY: T('todos los tipos (muchos servidores ya no lo permiten)', 'all types (many servers no longer allow it)'), AXFR: T('transferencia de zona completa (intento de volcar toda la zona DNS)', 'full zone transfer (attempt to dump the whole DNS zone)') }[v.toUpperCase()] || T('Tipo de registro DNS a consultar.', 'DNS record type to query.')) };
        else if (!t.items[0].label || t.items[0].label === 'NOMBRE' || t.items[0].label === 'argumento') t.items[0] = { label: T('nombre', 'name'), desc: T('Nombre de dominio (o IP con -x) que se consulta.', 'Domain name (or IP with -x) being queried.') };
      }
    },
  };

  function get(name) { return REG[name] || null; }
  const api = { get, wrapper, explainRegex, explainMode, explainSed, REG, WRAP, SHELLS };
  if (isNode) module.exports = api; else root.CmdSpecial = api;
})(typeof self !== 'undefined' ? self : this);
