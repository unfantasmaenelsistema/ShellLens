/* ShellLens · acceso a la base de comandos (data/index.json + data/cmd/*.json).
 * En el navegador usa fetch; en Node (tests) lee del disco. */
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;

  function makeReader(base) {
    if (isNode) {
      const fs = require('fs'), path = require('path');
      return async (rel) => JSON.parse(fs.readFileSync(path.join(base || path.join(__dirname, '..', 'data'), rel), 'utf8'));
    }
    return async (rel) => {
      const r = await fetch((base || 'data/') + rel);
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + rel);
      return r.json();
    };
  }

  function createData(base) {
    const read = makeReader(base);
    let index = null, indexP = null;
    const cache = new Map();
    const api = {
      async init() {
        if (index) return index;
        if (!indexP) indexP = read('index.json').then(j => { index = j; return j; });
        return indexP;
      },
      get names() { return index ? index.cmds : []; },
      has(name) { return !!(index && index.lookup[name]); },
      fileOf(name) { return index && index.lookup[name]; },
      async get(name) {
        await api.init();
        const f = index.lookup[name];
        if (!f) return null;
        if (!cache.has(f)) cache.set(f, read('cmd/' + f + '.json').catch(() => null));
        return cache.get(f);
      },
      /* búsqueda para el autocompletado y el catálogo */
      search(q, limit) {
        if (!index) return [];
        q = q.toLowerCase().trim();
        if (!q) return [];
        const out = [];
        for (const c of index.cmds) {
          const n = c[0].toLowerCase();
          let score = -1;
          if (n === q) score = 0; else if (n.startsWith(q)) score = 1; else if (n.includes(q)) score = 2;
          else if ((c[2] || '').toLowerCase().includes(q)) score = 3;
          if (score >= 0) out.push([score, c[3] ? 0 : 1, n.length, c]);
        }
        out.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
        return out.slice(0, limit || 20).map(x => x[3]);
      },
    };
    return api;
  }

  const api = { createData };
  if (isNode) module.exports = api; else root.CmdData = api;
})(typeof self !== 'undefined' ? self : this);
