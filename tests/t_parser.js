const P = require('../js/shell-parser.js');
let fail = 0;
function ok(c, m) { if (!c) { fail++; console.log('FAIL', m); } }
function parse(s) { const r = P.tryParse(s); return r; }
const cases = [
  'ls -la /tmp', 'tar -xzvf a.tgz && cd a || echo no', 'cat f | grep x | wc -l', 'echo "hola $USER $(date)" > out.txt 2>&1',
  'for i in 1 2 3; do echo $i; done', 'if [ -f a ]; then echo si; else echo no; fi', 'while read l; do echo "$l"; done < f',
  'case $x in a) echo a;; b|c) echo bc;; esac', 'f() { echo hi; }', 'x=1 y=2 cmd arg', 'cat <<EOF\nhola\nEOF\necho after',
  'echo $((1+2))', '(( i++ ))', 'for ((i=0;i<3;i++)); do echo $i; done', "echo $'a\tb'", 'diff <(ls a) <(ls b)', 'sleep 1 &',
  'a; b\nc', 'echo {a,b,c}.txt', 'ls *.txt', 'curl -s http://x | sh', '[[ -n $a && $b == c ]] && echo ok',
  'echo `date`', 'sudo rm -rf --no-preserve-root /', 'echo a # comentario', 'git commit -m "feat: x"', 'echo "a\\"b"',
];
for (const c of cases) { const r = parse(c); ok(r.ok, 'parse: ' + JSON.stringify(c) + ' → ' + (r.error || '')); }
const bad = ['echo "abc', "echo 'abc", 'if true; then echo', 'echo $(date', 'ls |', 'ls &&', 'fi', '(echo a'];
for (const c of bad) { const r = parse(c); ok(!r.ok, 'debería fallar: ' + c); }
// estructura
let t = parse('cat f | grep x > o && echo ok').tree;
ok(t.items[0].node.type === 'andor', 'andor');
ok(t.items[0].node.seq[0].node.type === 'pipeline' && t.items[0].node.seq[0].node.cmds.length === 2, 'pipeline 2');
let cmd = parse('FOO=1 ls -l "a b" $HOME').tree.items[0].node;
ok(cmd.assigns.length === 1 && cmd.words.length === 4, 'assign+words ' + cmd.words.length);
let cmd2 = parse('echo hi 2>&1 >/dev/null').tree.items[0].node;
ok(cmd2.redirs.length === 2 && cmd2.redirs[0].fd === '2', 'redirs');
let h = parse('cat <<EOF\nabc\nEOF').tree.items[0].node;
ok(h.redirs[0].body === 'abc\n', 'heredoc body ' + JSON.stringify(h.redirs[0].body));
console.log(fail ? fail + ' fallos' : 'parser OK (' + (cases.length + bad.length) + ' casos)');
process.exit(fail ? 1 : 0);
