#!/usr/bin/env python3
"""Fusiona la extracción de man pages (inglés, automática) con los ficheros
curados a mano (español + inglés) y genera data/cmd/*.json + data/index.json.

    python tools/build_data.py

Formato de tools/curated/*.txt  (ver tools/curated/README.md):
    @@ tar bsdtar            comando y alias  (con espacio = subcomando: «@@ git commit»)
    es: resumen en español
    en: summary in English
    tags: write net priv     efectos (read write delete net priv exec install system)
    style: gnu|bsdfirst|multi|kv|none
    special: chmod           explicador especial de JS
    pos: NOMBRE | es || en   operandos en orden (NOMBRE... variádico, NOMBRE@last = último)
    sub: add commit          subcomandos conocidos (busca <cmd>-<sub>)
    subalias: addr=address
    -x --extract=ARG | es || en
"""
import json, os, re, sys, glob, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "tools", "_cache", "man_raw.json")
CUR = os.path.join(ROOT, "tools", "curated")
OUT = os.path.join(ROOT, "data")
FORM_OK = re.compile(r"^-{1,2}[A-Za-z0-9][A-Za-z0-9_.+-]*$")


def fname(name):
    """Nombre de fichero seguro y sin colisiones en sistemas que no distinguen mayúsculas."""
    s = re.sub(r"[^A-Za-z0-9._+-]", lambda m: "_%02x" % ord(m.group(0)), name)
    return re.sub(r"[A-Z]", lambda m: "~" + m.group(0).lower(), s)


def parse_forms(spec):
    """'-f --file=ARCHIVE --color[=WHEN]' -> (forms, arg, optional)"""
    forms, arg, opt = [], "", False
    for tok in spec.split():
        m = re.match(r"^((?:-{1,2}|~|\+)[^=\[\s]+)(\[=([^\]]*)\]|=(.*))?$", tok)
        if not m:
            raise ValueError("forma de opción no válida: " + tok)
        forms.append(m.group(1))
        if m.group(2):
            if m.group(2).startswith("["):
                arg, opt = m.group(3), True
            else:
                arg = m.group(4)
    return forms, arg, opt


def split_langs(text):
    if "||" in text:
        a, b = text.split("||", 1)
        return a.strip(), b.strip()
    return text.strip(), ""


def parse_curated():
    cmds = collections.OrderedDict()
    for path in sorted(glob.glob(os.path.join(CUR, "*.txt"))):
        cur = None
        lineno = 0
        pending = None
        for raw in open(path, encoding="utf-8"):
            lineno += 1
            line = raw.rstrip("\n")
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            if line[0] in " \t" and pending is not None:  # continuación
                pending[0] += " " + line.strip()
                continue
            pending = None
            where = f"{os.path.basename(path)}:{lineno}"
            if line.startswith("@@"):
                names = line[2:].split()
                if not names:
                    raise SystemExit(f"{where}: bloque sin nombre")
                if names[0] == "git" or True:
                    pass
                # «@@ git commit» → nombre con espacio = subcomando
                canon, aliases = None, []
                # un bloque es: primer token(s) separados por | para alias: «@@ tar bsdtar» ; subcomando: «@@ git+commit»
                canon = names[0].replace("+", "-")
                aliases = [a.replace("+", "-") for a in names[1:]]
                cur = {"n": canon, "al": aliases, "es": "", "en": "", "tags": [], "style": "", "special": "",
                       "pos": [], "sub": [], "subalias": {}, "sd": {}, "opts": [], "tip": [], "src": where}
                if canon in cmds:
                    raise SystemExit(f"{where}: bloque duplicado {canon}")
                cmds[canon] = cur
                continue
            if cur is None:
                raise SystemExit(f"{where}: línea fuera de un bloque: {line}")
            if line.startswith(">"):
                body = line[1:].strip()
                if "|" not in body:
                    raise SystemExit(f"{where}: subcomando sin « | »")
                nm, desc = body.split("|", 1)
                es, en = split_langs(desc)
                for one in nm.split():
                    cur["sd"][one] = {"es": es, **({"en": en} if en else {})}
                continue
            if line[0] in "-~+":
                if "|" not in line:
                    raise SystemExit(f"{where}: opción sin « | »: {line}")
                spec, desc = line.split("|", 1)
                try:
                    forms, arg, opt = parse_forms(spec.strip())
                except ValueError as e:
                    raise SystemExit(f"{where}: {e}")
                es, en = split_langs(desc)
                o = {"f": forms, "es": es}
                if en: o["en"] = en
                if arg == "-":
                    o["_noarg"] = 1
                elif arg:
                    o["a"] = arg
                if opt: o["ao"] = 1
                cur["opts"].append(o)
                pending = None
                continue
            m = re.match(r"^(es|en|tags|style|special|pos|sub|subalias|tip):\s*(.*)$", line)
            if not m:
                raise SystemExit(f"{where}: línea no reconocida: {line}")
            k, v = m.group(1), m.group(2)
            if k in ("es", "en"):
                cur[k] = v
            elif k == "tags":
                cur["tags"] = v.split()
            elif k in ("style", "special"):
                cur[k] = v.strip()
            elif k == "sub":
                cur["sub"] += v.split()
            elif k == "subalias":
                for kv in v.split():
                    a, b = kv.split("=")
                    cur["subalias"][a] = b
            elif k == "tip":
                tes, ten = split_langs(v)
                cur["tip"].append({"es": tes, **({"en": ten} if ten else {})})
            elif k == "pos":
                if "|" not in v:
                    raise SystemExit(f"{where}: pos sin « | »")
                nm, desc = v.split("|", 1)
                es, en = split_langs(desc)
                nm = nm.strip()
                role = {"n": re.sub(r"(\.\.\.|@last|\?.*)$", "", nm), "es": es}
                if en: role["en"] = en
                if "..." in nm: role["v"] = 1
                if "@last" in nm: role["l"] = 1
                mm = re.search(r"\?unless=(\S+)", nm)
                if mm: role["u"] = mm.group(1).split(",")
                if re.search(r"\?(?!unless)", nm) or nm.endswith("?"):
                    role["opt"] = 1
                cur["pos"].append(role)
    # resumenes en ingles que no estan en las man pages (archivo TSV)
    tsv = os.path.join(CUR, "en-summaries.tsv")
    TAB = chr(9)
    if os.path.exists(tsv):
        for ln in open(tsv, encoding="utf-8"):
            ln = ln.rstrip(chr(10))
            if TAB in ln:
                k, v = ln.split(TAB, 1)
                for c in cmds.values():
                    if k == c["n"] or k in c["al"]:
                        c["en"] = c["en"] or v
    return cmds


def main():
    raw = json.load(open(RAW, encoding="utf-8")) if os.path.exists(RAW) else {}
    cur = parse_curated()
    os.makedirs(os.path.join(OUT, "cmd"), exist_ok=True)
    for f in glob.glob(os.path.join(OUT, "cmd", "*.json")):
        os.remove(f)
    names = sorted(set(raw) | set(cur))
    index, nopt, ncur = [], 0, 0
    alias_taken = {}
    for name in names:
        man = raw.get(name)
        c = cur.get(name)
        # sinónimos de otro bloque curado: se resuelven más abajo
        o_list = []
        seen_forms = {}
        def add(opt):
            for fm in opt["f"]:
                if fm in seen_forms:
                    return False
            idx = len(o_list)
            o_list.append(opt)
            for fm in opt["f"]:
                seen_forms[fm] = idx
            return True
        man_by_form = {}
        if man:
            for e in man["opts"]:
                forms = []
                for v in e["v"]:
                    fm = v["f"].rstrip(":,;")
                    if FORM_OK.match(fm) and len(fm) < 40:
                        forms.append((fm, v["a"], v["o"]))
                if not forms:
                    continue
                arg = next((a for _, a, _ in forms if a), "")
                optl = next((o for _, a, o in forms if a), False)
                if arg and (not re.match(r"^[\w.<>:\[\]{}|/@%#,-]+$", arg) or len(arg) > 30):
                    arg = ""
                d = e["d"]
                if len(d) > 330:
                    cut = d[:330]; k = max(cut.rfind(". "), cut.rfind("; "))
                    d = cut[:k + 1] if k > 120 else cut.rsplit(" ", 1)[0] + "…"
                opt = {"f": [f for f, _, _ in forms], "en": d}
                if arg: opt["a"] = arg.strip("<>")
                if optl and arg: opt["ao"] = 1
                for f_ in opt["f"]:
                    man_by_form.setdefault(f_, opt)
        # 1) curadas
        used_man = set()
        if c:
            ncur += 1
            for o in c["opts"]:
                m = None
                for fm in o["f"]:
                    if fm in man_by_form:
                        m = man_by_form[fm]; break
                if m:
                    used_man.add(id(m))
                    if "en" not in o and m.get("en"):
                        o["en"] = m["en"]
                    # unir formas que la curada no lista (p. ej. alias largos)
                    for fm in m["f"]:
                        if fm not in o["f"] and fm not in seen_forms:
                            o["f"].append(fm)
                    if "a" not in o and "a" in m and not o.get("_noarg"):
                        print(f"  aviso arg: {name} {' '.join(o['f'])}  (man: {m['a']})", file=sys.stderr)
                if "en" not in o:
                    o["en"] = ""
                o.pop("_noarg", None)
                add(o)
        # 2) resto de la man page (solo inglés)
        if man:
            for m in {id(v): v for v in man_by_form.values()}.values():
                if id(m) in used_man:
                    continue
                add(dict(m))
        # estilo
        style = (c or {}).get("style", "")
        if not style:
            multi = sum(1 for o in o_list for f in o["f"] if re.match(r"^-[A-Za-z][A-Za-z0-9]+$", f))
            style = "multi" if multi >= 4 else "gnu"
        summ_es = (c or {}).get("es", "")
        summ_en = (c or {}).get("en", "") or (man or {}).get("summary", "")
        rec = {"n": name, "s": {"en": summ_en}}
        if summ_es: rec["s"]["es"] = summ_es
        als = list(dict.fromkeys(((c or {}).get("al", []) + ((man or {}).get("aliases", [])))))
        als = [a for a in als if a != name]
        if als: rec["al"] = als
        if man and man.get("syn"): rec["syn"] = man["syn"]
        rec["st"] = style
        if c:
            if c["tags"]: rec["tg"] = c["tags"]
            if c["special"]: rec["x"] = c["special"]
            if c["pos"]: rec["p"] = c["pos"]
            if c["sub"]: rec["sub"] = c["sub"]
            if c["subalias"]: rec["sa"] = c["subalias"]
            if c["sd"]: rec["sd"] = c["sd"]
            if c["tip"]: rec["tip"] = c["tip"]
        rec["o"] = o_list
        nopt += len(o_list)
        fn = fname(name)
        with open(os.path.join(OUT, "cmd", fn + ".json"), "w", encoding="utf-8") as f:
            json.dump(rec, f, ensure_ascii=False, separators=(",", ":"))
        index.append({"n": name, "f": fn, "al": als, "es": bool(summ_es), "s": summ_es or summ_en,
                      "c": 1 if c else 0, "k": len(o_list)})
    # tabla de nombres → fichero (incluye alias); un bloque curado manda sobre un alias de man
    lookup = {}
    for r in index:
        if r["c"]:
            lookup[r["n"]] = r["f"]
    for r in index:
        lookup.setdefault(r["n"], r["f"])
    for r in index:
        for a in r["al"]:
            lookup.setdefault(a, r["f"])
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as f:
        json.dump({"cmds": [[r["n"], r["f"], r["s"], r["c"], r["k"]] for r in index],
                   "lookup": lookup}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(index)} comandos ({ncur} curados), {nopt} opciones, {len(lookup)} nombres")


if __name__ == "__main__":
    main()
