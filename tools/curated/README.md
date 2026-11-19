# Ficheros curados

Cada `*.txt` de esta carpeta describe comandos con explicación en español (y opcionalmente en inglés).
`tools/build_data.py` los fusiona con las man pages extraídas: **lo curado manda**, y lo que no esté aquí
se completa con el texto inglés de la man page.

```
@@ tar bsdtar               ← bloque: nombre y alias. «@@ git-commit» = subcomando de git
es: resumen en español
en: summary in English      ← opcional si la man page ya trae resumen (si no, añádelo en en-summaries.tsv)
tags: read write net        ← efectos: read write delete net priv exec install system
style: bsdfirst             ← gnu (defecto) | multi (-sS, -name…) | bsdfirst (tar xzvf, ps aux)
special: sed                ← explicador especial de js/special.js
pos: ORIGEN... | texto es || text en     ← operandos en orden; NOMBRE... variádico, NOMBRE@last = el último,
pos: PATRÓN?unless=-e,-f | …               NOMBRE? opcional, ?unless=… no existe si se usan esas opciones
sub: add commit             ← subcomandos con fichero propio (<cmd>-<sub>)
subalias: addr=address
> start | Inicia la unidad. || Start the unit.          ← subcomando «en línea» (sin fichero propio)
-x --extract=ARCHIVO | texto es || text en            ← opción: formas separadas por espacios;
--color[=WHEN] | …                                      «=ARG» valor obligatorio, «[=ARG]» opcional,
-L=- | …                                                «=-» = no lleva valor (no hereda el de la man)
~a | …                      ← forma BSD sin guion (solo style: bsdfirst)
+short | …                  ← opción con «+» (dig)
tip: consejo es || tip in English
```

Reglas:

- Una línea que empieza por espacio continúa la anterior.
- Si la parte inglesa (`|| …`) falta, se usa la de la man page; si tampoco existe, la interfaz muestra el español.
- Un `pos:` con `@last` toma el último operando (p. ej. el destino de `cp`).
- Después de editar: `python tools/build_data.py && node tests/t_engine.js`.
- Si añades una regla de riesgo en `js/risk.js`, añade su caso a `tests/t_engine.js`.
