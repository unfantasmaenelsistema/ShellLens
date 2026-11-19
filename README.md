# CmdLens

**Pega un comando de Linux y entiende, pieza a pieza, qué hace y qué puede salir mal — antes de ejecutarlo** · *Paste a Linux command and understand, piece by piece, what it does and what can go wrong — before you run it*

👉 **https://unfantasmaenelsistema.github.io/CmdLens/**

Es una web estática (GitHub Pages) que **no ejecuta nada y no envía nada**: todo el análisis ocurre en tu navegador. Está inspirada en [explainshell](https://explainshell.com/), pero es una implementación independiente, bilingüe (**español e inglés**), con tema claro u oscuro y con una capa de **avisos de seguridad** pensada para clase.

## Qué hace

- **Desglosa el comando** en comandos, opciones, valores, argumentos, redirecciones, asignaciones y operadores, y los resalta en la línea original: al pasar el ratón por una pieza se ilumina su explicación.
- **Entiende la sintaxis de la shell**: tuberías (`|`), `&&`, `||`, `;`, `&`, subshells, grupos `{ }`, `if`, `for`, `while`, `case`, funciones, `[[ ]]`, `(( ))`, here-documents, `$(…)`, `` `…` ``, `<(…)`, `${…}`, llaves `{a,b}` y comodines.
- **Casa cada opción con su explicación**: opciones agrupadas (`-xzvf`), largas y abreviadas (`--verb`), con valor pegado (`-d:`, `--color=auto`), estilo BSD (`tar xzvf`, `ps aux`), de varias letras (`nmap -sS`, `find -name`) y subcomandos de uno o dos niveles (`git commit`, `ip addr show`, `docker compose up`).
- **Abre los envoltorios** y explica también el comando de dentro: `sudo`, `env`, `nohup`, `timeout`, `xargs`, `watch`, `bash -c '…'`, `su -c`, `ssh host 'comando'`, `eval`, `find -exec …`.
- **Explicadores específicos**: permisos de `chmod` (octal y simbólico, setuid/setgid/sticky), propietario de `chown`, guiones de `sed` con su expresión regular, operandos de `dd`, señales de `kill`, formatos de `date`, `dig`, condiciones de `[ ]`, y **expresiones regulares** (BRE, ERE y PCRE) explicadas pieza a pieza para `grep`/`sed`.
- **Avisa de lo peligroso antes de ejecutarlo**, con nivel de gravedad, motivo y una alternativa más segura: borrados masivos (`rm -rf /`, variables sin comillas), `curl … | sh`, código ofuscado, *reverse shells* y `/dev/tcp`, bombas fork, `dd`/`mkfs` sobre discos, `chmod 777` y setuid, cuentas con UID 0, persistencia (cron, `authorized_keys`, `sudoers`), anti-forense, firewall desactivado, contenedores `--privileged`, `terraform destroy`, `aws s3 rm --recursive`, secretos en la línea de comandos, herramientas ofensivas…
- **Catálogo** navegable con todas las opciones de cada comando, **galería de ejemplos** (incluida una categoría de comandos peligrosos para analizar en clase), historial local y enlace para compartir (el comando va en la parte `#` de la dirección, que nunca sale del navegador).

## La base de datos

| | |
|---|---|
| Comandos | **2.570** |
| Con explicaciones revisadas a mano en español e inglés | **391** (builtins, coreutils, texto, procesos, sistema, redes, firewall, `nmap`, SSH, archivos y compresión, paquetes, git, Docker, Kubernetes, nube, seguridad ofensiva y defensiva…) |
| Opciones | **34.016** |

Se genera con dos capas:

1. **Automática**: `tools/extract_man.py` renderiza con `groff` las páginas `man` de Kali/Debian (secciones 1, 8 y 6) y extrae cada opción con su descripción (en inglés, marcada con la etiqueta **EN** en la interfaz).
2. **Curada**: los ficheros de `tools/curated/*.txt` añaden la explicación en español (y en inglés), los operandos con su papel, subcomandos, consejos y los efectos de cada comando. La curada manda sobre la automática. Formato y cómo ampliarla: [`tools/curated/README.md`](tools/curated/README.md).

`tools/build_data.py` fusiona ambas y escribe `data/index.json` y un JSON por comando en `data/cmd/` (se descargan bajo demanda).

## Límites

- No ejecuta nada, así que no puede saber qué contienen tus variables, alias, funciones ni archivos.
- Una opción ausente de la base se marca como «no reconocida»: puede ser válida en tu versión. Consulta siempre `man`.
- Un aviso de riesgo es una ayuda, no una garantía: que no haya alertas no significa que el comando sea seguro.
- El analizador cubre el uso real de bash/sh, no el 100 % de la gramática (por ejemplo, no expande alias ni historial `!!`).

## Desarrollo

```bash
# servidor local (la web hace fetch de data/, no funciona con file://)
python -m http.server 8811

# pruebas (sin dependencias, solo Node)
node tests/t_parser.js
node tests/t_engine.js

# regenerar la base a partir de las man pages (desde un Kali/Debian, p. ej. WSL)
sudo apt install man-db groff-base git-man
python3 tools/extract_man.py tools/_cache/man_raw.json 1 8 6
python3 tools/build_data.py
```

Estructura: `js/shell-parser.js` (tokenizador y parser), `js/explain.js` (motor), `js/special.js` (explicadores y envoltorios), `js/risk.js` (reglas de seguridad), `js/data.js` (carga de datos), `js/app.js` (interfaz), `data/` (base generada), `tools/` (generadores y datos curados), `tests/`.

## Privacidad

Sin servidor, cuentas, base de datos ni analítica. El idioma, el tema y los últimos comandos se guardan solo en el `localStorage` de tu navegador (`cl_lang`, `cl_theme`, `cl_hist`).

## Créditos y licencia

Código bajo licencia **MIT** (ver [`LICENSE`](LICENSE)). Inspirado en [explainshell](https://explainshell.com/) de Idan Kamara (GPL-3.0); CmdLens no contiene código suyo. Las descripciones en inglés proceden de las páginas `man` de cada proyecto y conservan la licencia de sus autores; se incluyen resumidas, para explicar cada opción.

Hecho por [Un Fantasma en el Sistema](https://www.unfantasmaenelsistema.com/) · Tienda [GhoStore](https://www.ghostore.unfantasmaenelsistema.com/)

---

## English

CmdLens is a static web app (GitHub Pages) that explains a pasted Linux command **before** you run it. Nothing is executed or sent anywhere: the analysis runs in your browser. It parses shell syntax (pipes, redirections, loops, substitutions, here-docs), matches every option with its explanation (bundled, long, abbreviated, BSD-style, subcommands), opens wrappers such as `sudo`, `bash -c`, `ssh host cmd`, `xargs` and `find -exec`, explains `chmod` modes, `sed` scripts and regular expressions, and raises **security warnings** with severity, reason and a safer alternative. The interface is bilingual (Spanish/English) with light and dark themes. The database holds 2,570 commands (391 hand-curated in both languages) and 34,016 options, generated from the Kali/Debian man pages plus curated files. MIT licensed; inspired by explainshell but an independent implementation.
