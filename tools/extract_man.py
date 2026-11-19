#!/usr/bin/env python3
"""Extrae opciones de las páginas man instaladas (Kali/Debian) a un JSON intermedio.

Uso (dentro de WSL):  python3 extract_man.py <salida.json> [secciones...]

Renderiza cada página con `man -l` (groff), así valen todos los dialectos
(man, mdoc, pod2man, help2man...) y se parsea el texto resultante:
una línea que empieza por «-» es la cabecera de una opción y las líneas con
más sangría que siguen son su descripción.
"""
import glob, gzip, json, os, re, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

OUT = sys.argv[1] if len(sys.argv) > 1 else "man_raw.json"
SECS = sys.argv[2:] or ["1", "8", "6"]

ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]|\x1b\].*?\x07|.\x08")
SECTION = re.compile(r"^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9 \-/&,()._]{2,}$")
OPTHEAD = re.compile(r"^-{1,2}[A-Za-z0-9?@#%+]")
VARIANT = re.compile(
    r"^(-{1,2}[A-Za-z0-9?@#%+][A-Za-z0-9_.+:-]*)"      # nombre
    r"(?:(\[=|=|\[ ?| )(.*))?$")                         # separador + argumento
SKIP_SECTIONS = {"SYNOPSIS", "SEE ALSO", "AUTHOR", "AUTHORS", "COPYRIGHT", "REPORTING BUGS",
                 "BUGS", "FILES", "HISTORY", "LICENSE", "STANDARDS", "CONFORMING TO",
                 "RESUMEN", "VÉASE TAMBIÉN", "AUTOR", "AUTORES"}


def render(path):
    env = dict(os.environ, MANWIDTH="400", MANPAGER="cat", LC_ALL="C.UTF-8", GROFF_NO_SGR="1", TERM="dumb")
    try:
        p = subprocess.run(["man", "-l", "--nj", "--nh", "-P", "cat", path], capture_output=True,
                           env=env, timeout=60)
    except Exception:
        return ""
    return ANSI.sub("", p.stdout.decode("utf-8", "replace"))


def parse_tag(tag):
    """'-n, --lines=[-]NUM' -> lista de variantes."""
    out = []
    parts = re.split(r",\s+|\s+\|\s+|\s+or\s+|\s+/\s+", tag.strip())
    for part in parts:
        part = part.strip().rstrip(",;:")
        m = VARIANT.match(part)
        if not m:
            continue
        name, sep, arg = m.group(1), m.group(2), (m.group(3) or "")
        optional = False
        if sep:
            if sep.startswith("["):
                optional = True
            arg = arg.strip()
            arg = re.sub(r"[\]\[]+$", "", arg) if optional else arg
            arg = arg.strip("[]<>{} ").strip()
            arg = arg.split()[0] if arg and " " in arg and not optional else arg
        else:
            arg = ""
        if len(arg) > 40:
            arg = ""
        out.append({"f": name, "a": arg, "o": optional})
    return out


def clean_desc(lines):
    text = " ".join(l.strip() for l in lines if l.strip())
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > 520:
        cut = text[:520]
        k = max(cut.rfind(". "), cut.rfind("; "))
        text = cut[: k + 1] if k > 200 else cut.rsplit(" ", 1)[0] + "…"
    return text


def parse_page(text):
    lines = text.splitlines()
    sections, cur, body = [], None, []
    for ln in lines:
        if ln and not ln.startswith(" ") and SECTION.match(ln.strip()):
            if cur is not None:
                sections.append((cur, body))
            cur, body = ln.strip(), []
        else:
            body.append(ln)
    if cur is not None:
        sections.append((cur, body))
    info = {"name": "", "summary": "", "syn": "", "opts": []}
    for title, body in sections:
        t = title.upper()
        if t in ("NAME", "NOMBRE"):
            joined = " ".join(l.strip() for l in body if l.strip())
            m = re.match(r"(.+?)\s+[-–—]\s+(.*)", joined)
            if m:
                info["name"], info["summary"] = m.group(1), m.group(2)
            else:
                info["name"] = joined
        elif t in ("SYNOPSIS", "RESUMEN"):
            syn = [re.sub(r"\s+", " ", l.strip()) for l in body if l.strip()]
            info["syn"] = " ⏎ ".join(syn[:6])
    seen = {}
    for title, body in sections:
        if title.upper() in SKIP_SECTIONS or title.upper() in ("NAME", "NOMBRE"):
            continue
        cur_h = None  # (indent, variants, desc lines)
        def flush():
            nonlocal cur_h
            if cur_h and cur_h[1]:
                d = clean_desc(cur_h[2])
                for v in cur_h[1]:
                    pass
                key = tuple(v["f"] for v in cur_h[1])
                if key not in seen:
                    seen[key] = {"v": cur_h[1], "d": d, "sec": title}
            cur_h = None
        for ln in body:
            if not ln.strip():
                if cur_h is not None:
                    cur_h[2].append("")
                continue
            ind = len(ln) - len(ln.lstrip(" "))
            s = ln.strip()
            is_head = bool(OPTHEAD.match(s)) and (cur_h is None or ind <= cur_h[0])
            if is_head:
                # separar etiqueta y descripción en línea (2+ espacios)
                m = re.split(r"\s{2,}", s, maxsplit=1)
                tag, rest = m[0], (m[1] if len(m) > 1 else "")
                variants = parse_tag(tag)
                if not variants or not variants[0]["f"].startswith("-"):
                    if cur_h is not None and ind > cur_h[0]:
                        cur_h[2].append(ln)
                    continue
                # descartar si la etiqueta parece prosa («-- text»)
                flush()
                cur_h = (ind, variants, [rest] if rest else [])
            else:
                if cur_h is not None:
                    if ind > cur_h[0]:
                        cur_h[2].append(ln)
                    else:
                        flush()
        flush()
    info["opts"] = list(seen.values())
    return info


def work(path):
    base = os.path.basename(path)
    name = re.sub(r"\.(\d\w*)(\.gz)?$", "", base)
    sec = re.search(r"\.(\d\w*)(?:\.gz)?$", base)
    txt = render(path)
    if not txt.strip():
        return name, None
    info = parse_page(txt)
    info["sec"] = sec.group(1) if sec else ""
    info["file"] = base
    # alias por línea NAME: «gzip, gunzip, zcat»
    als = [a.strip() for a in re.split(r",\s*", info["name"]) if a.strip()]
    info["aliases"] = [a for a in als if re.match(r"^[\w.+@-]+$", a) and a != name]
    return name, info


def main():
    files = []
    for s in SECS:
        files += sorted(glob.glob(f"/usr/share/man/man{s}/*.gz") + glob.glob(f"/usr/share/man/man{s}/*.[0-9]"))
    # prioridad: sección 1 sobre 8 al repetirse el nombre
    result, order = {}, {"1": 0, "8": 1, "6": 2}
    with ThreadPoolExecutor(max_workers=24) as ex:
        for name, info in ex.map(work, files):
            if not info:
                continue
            cur = result.get(name)
            if cur is None or order.get(info["sec"][:1], 9) < order.get(cur["sec"][:1], 9):
                result[name] = info
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)
    n_opts = sum(len(v["opts"]) for v in result.values())
    print(f"{len(result)} páginas, {n_opts} opciones")


if __name__ == "__main__":
    main()
