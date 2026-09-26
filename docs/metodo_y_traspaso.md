# Método de trabajo y traspaso — ContFast Enterprise

Este documento existe porque el trabajo de los lotes 60 a 105 se hizo en una
sesión que no se hereda. Lo que sí se hereda es el repositorio. Aquí queda
escrito el método, las trampas que costaron tiempo, y lo que falta.

Si eres un asistente que abre este repositorio por primera vez: **lee esto
entero antes de tocar nada**. Casi todo lo que parece una oportunidad de
mejora rápida aquí ya fue mirado, y varias veces la mejora rápida resultó ser
un error.

---

## 1. La regla de alcance

**Solo se cierra el hueco en el código, hacia adelante. Nunca se remedian
datos históricos ni de producción sin que el dueño lo pida explícitamente.**

Medir sí: una consulta `SELECT` para saber cuántas filas tiene un problema es
bienvenida y de hecho es el paso previo obligatorio. Escribir sobre datos ya
emitidos, no. Una factura emitida es un documento fiscal.

## 2. El trabajo va por lotes

Un lote es un cambio con un solo asunto, verificado entero antes de tocar
`git commit`. La numeración va por `lote NN` en el mensaje de commit. El
último cerrado está en la sección 7; `git log --oneline -5` es la fuente de
verdad si este documento se queda atrás.

Para correr **todo** de una vez (tipos, bancos, pruebas y build) está
`scratch/_to_delete/verificar.ps1`. Salta los bancos listados en
`deuda_bancos.txt`, que no se escribe a mano: lo genera `baseline.ps1`
comparando contra HEAD en un árbol aparte.

El ciclo completo de un lote, sin saltarse pasos:

1. **Medir antes de decidir.** Esto no es una formalidad. En este repositorio
   se han descartado por medición: el agujero de `x-forwarded-for` (Vercel
   sobrescribe la cabecera a propósito, para impedir la suplantación), el
   módulo de documentos entero (la tabla `document_shares` tenía cero filas
   desde que existía), y cuatro "cabos sueltos" que ya estaban arreglados.
   Cuando la medición contradice la sospecha, gana la medición.

2. **Escribir el cambio**, con un comentario que explique *por qué*, no *qué*.
   Los comentarios largos de este repositorio son deliberados: son el único
   sitio donde sobrevive el razonamiento cuando la conversación se pierde.

3. **Escribir el banco de comprobaciones** en `scratch/verificar_<asunto>.ts`.
   Se ejecuta con `npx tsx`. Es un fichero que **se commitea con el lote** —
   hay más de 130 en `scratch/`, y son la memoria real del proyecto.

4. **La contraprueba.** Se revierten los ficheros del lote al estado anterior y
   se vuelve a correr el banco. **Tiene que dar 100% FALLA.** Cualquier
   comprobación que siga en OK antes del arreglo no está comprobando el
   arreglo: hay que apretarla, o convertirla en una precondición que lance
   excepción. Nunca se deja pasar un OK previo. Esto no es opcional y es lo
   que más errores ha cazado.

5. **Mutantes.** Se introducen de uno en uno cambios pequeños en el código
   arreglado (quitar una condición, cambiar un signo, borrar un `import`) y se
   comprueba que el banco los mata. Un mutante que sobrevive es una
   comprobación que no comprueba nada. Los mutantes equivalentes (los que no
   cambian el comportamiento) se documentan en el código, no se disimulan.

6. **`pnpm exec tsc --noEmit`, `pnpm test`, `pnpm build`.** Los tres, siempre.
   El banco no sustituye al compilador: en el lote 103, tres rutas llamaban a
   `baseUrlMseller` sin importarlo y el banco las dio por buenas; lo cazó
   `tsc`.

7. **Commit.** Ver sección 5.

## 3. Cómo se escribe un banco que sirve

Las trampas que han salido, todas reales, todas costaron un lote:

- **`includes()` sobre un identificador es una trampa doble**: es coincidencia
  por prefijo *y* prueba de mera presencia. `documentServiceX` contiene
  `documentService`; un doble local `const empezarAPerseguir = async () => null`
  deja el nombre presente; una llamada sin su `import` deja el nombre presente.
  Cura: un ayudante `nombra(f, id)` con `\bid\b`, y comprobar **el import y el
  uso por separado**, anclando el import en el especificador completo con sus
  comillas.

- **Una negación es verdadera de balde antes de que exista el mecanismo.**
  "Nadie importa X" es cierto *porque* X no existe todavía: como `ok()` regala
  un OK en la contraprueba. Hay que combinarla con una marca del estado
  posterior (el fichero ausente **y** sin referencias) o convertirla en
  precondición que lance.

- **Una precondición tiene que valerse en los dos estados.** Si codifica el
  estado posterior, la contraprueba no falla: revienta.

- **Un `import` estático de un módulo que el lote crea hace reventar la
  contraprueba** ("Cannot find module") en vez de fallar comprobación a
  comprobación. Cura: `await import()` perezoso dentro de `main()`, y un
  ayudante que reporte FALLA por etiqueta cuando el módulo no está.

- **Las precondiciones nombran ficheros, no cuentan ficheros.** Contar dio un
  número equivocado una vez y casi pasa.

## 4. Trampas de este entorno (Windows + PowerShell)

- `$env:GIT_LITERAL_PATHSPECS = '1'` es **obligatorio** antes de cualquier
  `git add`. Sin eso, las rutas con corchetes (`app/api/v1/invoices/[id]/...`)
  se descartan **en silencio**: el commit sale sin ellas y nada avisa.
- `Test-Path` necesita `-LiteralPath`. Sin eso, PowerShell interpreta `[id]`
  como comodín y jura que el fichero no existe.
- `$env:GIT_PAGER = 'cat'` y `--no-pager`, o los guiones se quedan colgados en
  el paginador.
- Borrar `.git\HEAD.lock` y `.git\index.lock` antes de cada commit; se quedan
  huérfanos con frecuencia.
- **`.next\types\validator.ts` se queda rancio** y produce errores de `tsc` que
  no existen en el código. Ante un error de tipos que señala a `.next`:
  `Remove-Item -Recurse -Force .next` y volver a correr.
- **`pnpm build` y `pnpm dev` NO pueden compartir `.next`.** `verificar.ps1` termina
  con `pnpm build`, y si el servidor de desarrollo está levantado, los artefactos de
  producción (`BUILD_ID`, `app-path-routes-manifest.json`, `export-marker.json`) se
  mezclan con `.next/dev/` y **el `dev` empieza a contestar 404 a rutas que existen**.
  Pasó el 2026-09-26 en el lote 198: `/auth/login` y `/api/v1/auth/refresh` daban 404
  con los ficheros perfectamente en su sitio, y parecía que la aplicación se había
  roto. La cura: parar el `dev`, `Remove-Item -Recurse -Force .next`, y levantarlo
  otra vez **después** de que termine el barrido. Al lanzar `verificar.ps1`, contar con
  que el `dev` se queda inservible hasta entonces.
- **`.next/dev/types/*` puede quedarse con el contenido DUPLICADO** (Next 16, con el
  servidor de desarrollo levantado). `tsconfig.json` incluye `.next/dev/types/**/*.ts`
  a propósito —son los tipos de rutas—, así que `tsc` falla con errores de SINTAXIS
  (`';' expected`, `Declaration or statement expected`) en un fichero que no es tuyo.
  Pasó el 2026-09-25 en el lote 196: `routes.d.ts` traía `declare global {` **dos**
  **veces** (líneas 210 y 399) porque dos escrituras del servidor se concatenaron,
  seguramente al morir el proceso. **Antes de sospechar del código**: mirar si el
  fichero repite `declare global`, y si sí, borrar `.next/dev/types/routes.d.ts` y
  `validator.ts` — se regeneran solos. `tsc` volvió a 0 sin tocar una línea de `src/`.
  El paso 0 de `verificar.ps1` solo mira `.next	ypesalidator.ts`, que es la versión
  antigua de esta misma trampa.
- **Finales de línea mezclados en el mismo árbol.** Son CRLF: `msellerClient.ts`,
  `sincronizarPendientes.ts`, `queue.ts`, los ficheros de rutas y los bancos.
  Son LF: `worker.ts`, `jobRunners.ts`, `invoiceDbBooker.ts`, `sesionMseller.ts`,
  `escalera.ts`, `perseguirVeredicto.ts`, `urlMseller.ts`,
  `imagenesIncrustadas.ts`. Importa: un mutante con el salto de línea
  equivocado no falla, **no aplica**, y eso se confunde con un banco que
  funciona.

## 5. Git

- **Nunca `git push`.** Se commitea en local y se le recuerda al dueño que
  suba. Esto es una instrucción suya, no una precaución.
- El mensaje va en un fichero (`scratch/_to_delete/commit_msgNN.txt`) y se
  commitea con `git commit -F`.
- Nada de `git reset` en los guiones de commit. Si lo que está preparado no es
  exactamente lo que el lote toca, el guion se niega y avisa; no arregla el
  índice por su cuenta.

## 6. Cómo está el reloj del e-CF (contexto que no está en ningún otro sitio)

- **mSeller devuelve la firma (`securityCode` + `qr_url`) de inmediato; el
  veredicto de la DGII llega después.** Por eso una factura en `submitted` se
  puede imprimir legalmente: la representación impresa solo necesita firma y
  código QR.
- La DGII acepta o rechaza en "décimas de segundo"; el límite de retransmisión
  por contingencia es de **72 horas**; el acuse de recibo y la aprobación
  comercial no tienen plazo y la segunda es opcional.
- Desde el lote 102 la propia factura persigue su veredicto, con una escalera
  que empieza a los **0,5 s** (`services/dgii/escalera.ts`, alcance total ~9
  minutos). Ya no hace falta que nadie pulse "sincronizar".
- **El worker de `dgii-submissions` ignora `job.name` y siempre emite.**
  Cualquier trabajo de consulta de estado que se ponga en esa cola
  **reemitiría el e-CF**. Por eso la persecución vive en su propia cola,
  `dgii-estado`.
- `triggerFallback` en `queue.ts` es el único camino que se ve en desarrollo
  local (no hay Redis). Hasta el lote 102 ignoraba `opts.delay`, con lo que una
  escalera de reintentos disparaba todos los intentos a la vez.

## 7. Estado ahora mismo

Commiteados: lotes 99 (guardar la petición que se manda), 100 (retirar el
módulo de documentos, 996 líneas), 101 (compartir la sesión de mSeller), 102
(perseguir el veredicto), 103 (una sola dirección de mSeller), 104 (retirar
1.515 líneas de código muerto), 105 (velocidad de impresión, `ac9dba8`) y 106
(este documento, y recuperar `verificar_p1_24_lote8.ts`, que acompañó al
commit `70559d4` pero nunca se commiteó y reventaba con ENOENT desde el lote
100), 107 (P3-48, `0a8dd65`), 108 (P3-49, `8f28e70`), 109 (notas paginadas,
`41fc024`), 110 (búsqueda de cotizaciones, `8560389`) y 111 (listado de
productos, `c38c96b`), 112 (URL de mSeller medida, `10f6816`), 113
(`[tiempos-pdf]` dice qué motor dibujó, `177c8a9`), 114 a 117 (revisión de los
bancos de deuda: `174bd2f`, `8ae96c9`, `1245a6e`, `71cd548`) y 118 (el medidor
de CERTIFICACION, `6ae4d7f`).

**Lotes 114 a 118 — la deuda de bancos, revisada.** `deuda_bancos.txt` tenía 61
bancos que `verificar.ps1` salta sin ejecutar. Medido:
- **33 necesitan base de datos**: se conectan al arrancar y ESCRIBEN (inserts
  y updates sin rollback). Son pruebas de integración y no se corren contra la
  base real. **Desde el lote 166 corren contra la base desechable**
  (`scratch/bancos_db/`, ver la sección 8): 33/33 en verde.
- **28 eran de solo código** y fallaban. Revisada cada comprobación (siguiendo
  las llamadas, no solo buscando el texto): **ninguna regresión en lo que
  vigilaban**. Todo era deriva — código movido (`existencia.ts`,
  `correoFactura.ts`, `motivoDgii`, `GuaranteeChecksView`), tipado mejorado
  después (`DbOTx`, `any` a 0), migraciones movidas a
  `drizzle_historico_pre_2026-09-04/`, ficheros retirados a propósito. Dos
  comprobaciones **defendían un error** ya corregido y se invirtieron (p2_28_31:
  "las líneas repetidas no se suman"). Los 28 vuelven a verde con mutantes que
  los hacen fallar, y salen de la lista (61 → 33). La verificación completa
  pasa de 83 a **111 bancos en verde**.
- **Un hallazgo real** (lote 118): el trinquete de `modo_certificacion` llevaba
  semanas sin contar (usaba `grep`, que no existe bajo cmd.exe) y por debajo la
  cifra había subido de 132 a 136. No era un fallo en ejecución (el `modo` de
  los datos es binario por el enum de la base y CERTIFICACION se rechaza en la
  entrada), sino 9 uniones escritas a mano donde existe `ModoOperativo`. Pasan
  al alias; techo 127; el contador ya no depende de la shell.

**Trampa que se repitió siete veces en esta revisión**: bancos que copian una
línea **literal** (un `import`, una firma, el cuerpo de un `catch`, una ventana
de N caracteres). Cualquier mejora posterior los rompe sin que falte nada, y un
banco en rojo permanente acaba en la lista de deuda, donde nadie lo mira. Al
escribir un banco: fijar la PROPIEDAD (con `bloque()`, regex tolerante al
espacio, "ningún `any`"), no la forma.

**Lote 106**: además del documento, `verificar.ps1` se paraba antes de correr
un solo banco (`tsc -p scratch` marcaba `verificar_vencimiento_impreso.ts`), y
al arreglarlo salieron cinco bancos en rojo fuera de la deuda. Ninguno señalaba
un defecto: tres leían ficheros retirados en el lote 100 y dos se quedaron
atrás tras cambios hechos a propósito (fechas dd-MM-aaaa del lote 96; la regla
de existencia llevada a `services/inventario/existencia.ts` en `be03e9e`).
**Lección**: retirar un módulo obliga a correr **todos** los bancos, no solo
el del lote; el lote 100 dejó tres rotos sin que nadie lo viera.

**Lote 107 (P3-48)**: `createPayment`/`createCheck` ya no admiten `'voided'`,
porque no existe anulación de pagos ni cheques (ni reversa del asiento ni
saldo devuelto). Medido: cero filas con ese estado. Sin migración; las
columnas `voided_by` quedan marcadas como reservadas. Si algún día se
implementa la anulación, el estado vuelve con ella.

**Lote 108 (P3-49)**: fuera `pdf-lib`, `node-forge`, `@types/node-forge` y
`xml-crypto`. **Siguen**, porque viven: `jsbarcode` y `tesseract.js`.

**Lotes 109 a 111 — los defectos reales que salieron al medir P3-45.** No se
unificó la paginación (ver sección 8); se cerraron los sitios donde una lista
**escondía registros que existen**:
- 109: la pantalla de notas de crédito/débito pedía páginas de TODOS los e-CF
  y filtraba las notas en el navegador ("Página 1 de 4" con tres vacías; una
  nota antigua enterrada entre facturas salía como "no hay notas").
  `/api/v1/ecf` acepta ahora `ecfType` como lista (`tiposDelFiltro`).
- 110: la búsqueda de cotizaciones filtraba solo la página que había llegado,
  y la API leía `limit` mientras la pantalla mandaba `per_page` (pedía 10,
  recibía 50: eso lo tapaba). Búsqueda al servidor, con escape de `%`/`_`.
- 111: productos pedía dos veces por tecla sin descartar respuestas viejas,
  pegaba el texto a la URL sin codificar, y guardar volvía a la página 1.

**Trampa nueva (lotes 109 y 110)**: varios bancos de P1-24 anclan la línea de
`import` **entera** (`import { eq, and, sql, type SQL } from 'drizzle-orm'`).
Añadir un nombre a ese import los hace fallar sin que falte nada. Al tocar un
import, correr los bancos de deuda que leen ese fichero y comparar el número
de FALLAs contra HEAD; si sube, ajustar la comprobación a lo que vigilaba.

**`PLAN.md` y `task.md` no se mantienen** (últimos cambios: 27-08 y 02-09).
AGENTS.md pide actualizarlos, pero el registro vivo de lo hecho es este
documento más los mensajes de commit y los bancos. En el lote 111 solo se
corrigió en `PLAN.md` la línea que atribuía la firma a `node-forge`, falsa
desde el lote 108.

Para commitear un lote hay ahora `scratch/_to_delete/commitear_lote.ps1
-Lote NN -Ficheros "a,b,c"` (el mensaje en `commit_msgNN.txt`): se niega si ya
había algo preparado o si lo preparado no es exactamente la lista.

**Lote 105** (velocidad de impresión):
- `src/services/print/imagenesIncrustadas.ts` (nuevo): incrusta en base64 las
  imágenes remotas del HTML antes de dárselo a Chromium. El QR ya venía
  incrustado; el **logo** era una URL de Supabase que el navegador salía a
  buscar por red **en cada impresión**, con un cliente esperando.
- `pdfGenerator.ts`: `generatePdfFromHtml` pasa a ser envoltura; el dibujo de
  siempre queda intacto en `dibujar`, sin una línea movida. Registra
  `[tiempos-pdf] render` con el reparto y si el navegador estaba caliente.
- Las dos rutas de impresión declaran `maxDuration = 60`.
- Banco: `scratch/verificar_imagenes_incrustadas.ts` (25 comprobaciones, 17 de
  ellas ejecutando contra un `globalThis.fetch` sustituido).
- Ojo: `commitear105.ps1` lleva `git reset`, contra la regla de la sección 5.
  No se copia de ahí; los guiones desde el 106 no lo llevan.

**Honestidad sobre el lote 105**: de las tres cosas, solo la incrustación del
logo ahorra tiempo de verdad. `[tiempos-pdf]` únicamente mide y `maxDuration`
únicamente evita un corte. **El arranque en frío de Chromium —
probablemente el coste mayor — no se tocó**, ni las 8 consultas a la base de
datos que preceden al dibujo. La primera línea `[tiempos-pdf]` en producción
lo decide: si domina `navegador: arrancado`, la respuesta es un **Gotenberg**
permanentemente caliente por el camino que ya existe (`PDF_SERVICE_URL`); si
sale `caliente`, el tiempo está en otro sitio.

## 8. Lo que queda

Del backlog de `docs/auditoria/auditoria_2026-09-03.md`, **en el orden en que
se trabaja** (medido el 2026-09-14, al abrir el lote 106):

| Orden | # | Asunto | Por qué ahí |
|---|---|---|---|
| ✔ | P3-48 | Cerrado en el lote 107 | — |
| ✔ | P3-49 | Cerrado en el lote 108. El "Radix duplicado" **no se toca**: `radix-ui` trae dentro `react-slot` 1.3.0 y `button.tsx` usa la 1.3.3; unificar bajaría de versión el `Slot` de todos los botones `asChild` | — |
| ✔ | P3-45 | Paginación a mano. **Medido**: no son 11 páginas sino 18 bloques en 16 ficheros, con 5 formas distintas de respuesta de la API, filtros en cliente sobre páginas del servidor (`quotes`, `adjustments`: páginas incompletas) y `products` que vuelve a la página 1 tras guardar. El componente compartido (`components/ui/pagination.tsx`) no es equivalente: se pinta siempre y su texto de rango depende de `pageSize` | Los defectos reales **ya están cerrados** (lotes 109-111). Queda la unificación visual, de pocas en pocas: **128** categorías, empleados, nóminas (el componente ganó ahí `itemLabel` y `hideControlsWhenSinglePage`, ambos con el valor de siempre por defecto); **129** compras, gastos y los dos listados de cheques en garantía; **130** cotizaciones y movimientos de inventario; **131** notas de ajuste, conduces y el ajuste rápido de inventario; **132** códigos de barras, pagos de CxP y el listado de productos; **133** `ecf` e `invoices`. **Cerrado**: 17 de 18 bloques al componente. El 18.º, el panel de inicio, **se deja fuera a propósito** (su texto lleva "(Historial total: N)", un dato que el componente no enseña) y va de precondición en `verificar_paginacion_comun_lote6.ts`, que además barre todas las pantallas para que no vuelva a aparecer una barra a mano. Regla del tramo, desde el 130: el tamaño de página a una constante, usada en lo que se pide **y** en lo que se enseña, porque el componente calcula el rango con ella. El detalle de `ecf/page.tsx` (texto con `meta.page`, botones con `page`) se cerró en el 133 |
| 4 | P2-42 | Doble motor de PDF. **Medido**: pdfkit (`src/services/pdfGenerator.ts`) no es solo nómina: recibos de nómina, liquidaciones, `reports/pdf` y `tools/print` | **Espera** a la línea `[tiempos-pdf]` de producción: si domina el arranque en frío, pasar 4 rutas más a Chromium empeora las cosas. Y recibos y liquidaciones son documentos del Código de Trabajo |
| 5 | — | `console.*` → `Logger`. **Medido**: `Logger` (`src/utils/logger.ts`) es una envoltura fina de `console` — escribe en el mismo sitio. En Vercel un `console.error` suelto se ve igual que uno por `Logger`. Revisados los que podrían volcar secretos: ninguno lo hace | Valor bajo: solo consistencia y silenciar `debug` en producción. Ya no es "lo que no pasa por Logger no se ve" |
| 6 | P3-47 | `next/image` sin usar (0 usos, 25 ficheros con `<img>`, muchos plantillas de impresión donde no aplica) | Valor bajo |
| 7 | P2-41 | Ficheros enormes (`documentTemplates.ts` 5.363, `invoices/page.tsx` 3.557) | No como lote propio: se parte cuando otro lote obligue a tocarlos |
| — | — | Cuatro avisos de react-doctor en los dos `KanbanTab.tsx` | Cuando se toquen esos ficheros |

**Ya cerrados, aunque este documento los daba por pendientes**: P2-35
(`26d9b59`, `7472aff`, `5afd62f`: factura, producto y compra por pasos) y
P2-36 (`96f33f3`: tablas de CxC y CxP unificadas).

Descartado por medición: **P3-44** (`x-forwarded-for`). Vercel sobrescribe esa
cabecera y no reenvía direcciones externas, precisamente para impedir la
suplantación. `x-vercel-forwarded-for` y `x-real-ip` son idénticas a ella.
No hay agujero que tapar.

Además, fuera de la tabla:
- **El cron SÍ tiene quien lo llame** (corregido en la revisión de los lotes
  114-118; este documento decía lo contrario): `.github/workflows/sincronizar-ecf.yml`
  (`15e71ec`) llama a `/api/v1/cron/sincronizar-ecf`. **Y está CONFIGURADO y
  funcionando desde el 09/09** (medido el 2026-09-18 con la CLI de GitHub: las
  60 últimas ejecuciones, en verde; la ruta devuelve 200). Este documento decía
  que faltaba configuración y que fallaba cada 5 minutos: era falso. Lo que sí
  hay que saber:
  - **No corre cada 5 minutos, aunque el `schedule` lo pida.** De las 57
    ejecuciones programadas entre el 09/09 y el 18/09: mediana **204 minutos**
    entre una y otra, mínimo 107, máximo **409** (casi 7 horas); 8 en 24 horas,
    no 288. GitHub aplaza los `schedule` en repos con poca actividad. **Decidido
    por el dueño el 2026-09-18: se deja así y se anota.** La factura se persigue
    sola ~9 minutos al emitirse (lote 102); esto es solo la red de seguridad,
    así que un veredicto tardío se ve horas después, no en minutos.
  - `CRON_SECRET` se rotó el 2026-09-18 (nuevo valor en Vercel —Production y
    Preview— y en el secreto de GitHub). `APP_URL` está como **variable** del
    repo (`https://contfast.vercel.app`); existe además un secreto `APP_URL`
    del mismo día que **no se usa** (el workflow lee `vars.APP_URL`).
- **33 bancos en `deuda_bancos.txt`**, todos de integración con base de datos
  (ver sección 7). Necesitan una base desechable.
- **Costo de venta 0 — MEDIDO el 2026-09-14** (solo lectura; scripts en
  `scratch/_to_delete/medir_costo_venta_cero*.ts`). Toda la operación real es
  de Latin Doors S.R.L. La sospecha inicial era equivocada:
  - **El pedido a suplidor NO es la causa**: hay uno solo en toda la historia,
    en borrador, nunca recibido.
  - **La causa real son los conteos físicos**: 104 entradas `adjustment`
    (julio–28 de agosto: "Ajuste rápido desde tabla", `CONTEO-2026-08`) meten
    existencia **sin costo y sin asiento contable**. Además 7 compras con NCF
    anteriores a P1-12 entraron sin costo (hoy ese camino ya lo lleva).
  - Hoy **23 de 34** niveles con existencia en PRODUCCIÓN tienen promedio 0
    (108 unidades; RD$171.893,74 a costo de catálogo; los 23 productos tienen
    `cost` de catálogo). El kardex vale RD$65.766 a promedio y RD$250.685 a
    catálogo. Todo lo que se venda de esos 23 saldrá con costo de venta 0.
  - Ya pasó: `CON-2026-000047` (14-09) despachó 2 puertas con costo 0
    (~RD$5.314 a catálogo, sin asentar).
  - **Lo más serio, y es código**: HAY DOS CUENTAS "Inventario de Mercancía".
    Las compras resuelven la clave `purchase_inventory` con defecto **1.1.06**
    (`expenses/route.ts:338`, `expenses/[id]/route.ts:1300`,
    `expenseService.ts:153`); el costo de venta y la nota de crédito resuelven
    `inventory` con defecto **1.1.03.01** (`deliveryRepository.ts:384`,
    `invoiceDbBooker.ts:566`). El catálogo sembrado y los mapeos solo traen
    1.1.03.01, así que la primera compra CREÓ la 1.1.06. Saldos en PRODUCCIÓN:
    **1.1.06 = +347.892,30** (entra por compras, nunca sale) y **1.1.03.01 =
    −229.927,25** (sale por costo de venta, nunca entró). Cada compra nueva lo
    agranda.
  - **Cuidado con el arreglo ingenuo del costo 0**: 66 asientos de compra
    llevan RD$3,27 M directo a 5.1.01 Costo de Venta (compras sin líneas de
    producto). Si esa mercancía es la que luego apareció por conteo, valorar el
    conteo a costo de catálogo la costearía DOS veces. La decisión de cómo se
    valora un sobrante de conteo es contable (del contador), no de código.
  - **HECHO en el lote 121** (autorizado por el dueño): compras, conduce y
    nota de crédito resuelven la cuenta de inventario en UN sitio,
    `resolverCuentaDeInventario` (clave `inventory`, defecto 1.1.03.01). Las
    compras nuevas cargan 1.1.03.01; en las empresas sin 1.1.06 las compras con
    productos dejan de fallar. **Pendiente del contador**: reclasificar el saldo
    ya asentado en 1.1.06 de Latin Doors hacia 1.1.03.01 (no se toca desde el
    código). **Sigue pendiente de decisión contable**: el costo 0 de los conteos
    físicos.
- ~~`ap/page.tsx` aplica cheques en garantía sin diálogo~~ **Hecho en el lote
  122**: el diálogo dice cuántos cheques, el total y la fecha de cobro.
- ~~`any` que volvieron sin que ningún banco lo viera~~ **Hecho en el lote
  123**: `: any` a 0 otra vez en servicios, repositorios y middleware, y
  `scratch/verificar_tope_any.ts` como trinquete global (`: any` techo 0,
  `as any` techo **0** tras los lotes 124-126. El 126 dejó un solo `ioredis`, el que fija bullmq (`verificar_ioredis_unico.ts` avisa si al actualizar bullmq se vuelven a separar). En el lote 125 dos moldes tapaban un tipo falso: `financialMovementService` usaba el tipo de transacción de node-postgres con postgres.js).
- ~~`QuoteService.getQuotes`: tres consultas en serie~~ **Hecho en el lote 127** (`Promise.all`).
- **El núcleo fiscal, medido el 2026-09-15 (lote 138): casi limpio.** Ningún NCF
  repetido, ninguna factura emitida sin NCF, 51 aceptadas y 1 rechazada en
  PRODUCCIÓN. Lo único: **`E340000000002` llevaba 316 horas (13 días) en
  `submitted`**. La escalera del lote 102 persigue ~9 minutos y después no queda
  nadie preguntando, porque el cron es configuración y no corre. El lote 138 no
  sustituye al cron: hace que el atasco **se vea** (aviso en la pantalla de e-CF
  con cuántos hay y cuánto lleva el más antiguo, y un botón que filtra la lista).
  El aviso **no reenvía** a propósito: un `submitted` sí salió y reenviarlo
  duplicaría un comprobante fiscal.
  **Lote 139: ese atasco no era esperar, era un rechazo que no se leía.** La
  DGII no tiene `E340000000002` (portal: "No fue encontrada"); mSeller la tiene
  en `Error`, con 6 rechazos por estructura del XML (`MontoExento` en
  `Totales`) intercalados con "En Proceso". `textoEstado` saltaba las entradas
  del historial sin `estado`, que es justo la forma del rechazo por estructura.
  Ahora cuentan si llevan una marca de rechazo (lista única en
  `services/dgii/marcasRechazo.ts`); un `error` sin marca, como "read
  ECONNRESET", sigue sin ser veredicto. **Al desplegar**: la próxima consulta la
  pondrá en `rejected` y la pantalla ofrecerá "Reenviar". **No reenviarla**:
  `E340000000003` ya acreditó esa factura entera. Un rechazo descubierto al
  consultar tampoco revierte asiento ni CxC. El cuadre contable de Latin Doors,
  que es donde salió, está en `docs/auditoria/cuadre_latin_doors_informe.md`
  (sin commitear).
  **Lote 140: un rechazado ya contabilizado se DA DE BAJA, a propósito.** No se
  revierte solo (decisión del dueño, 2026-09-16): un rechazado se corrige
  reenviando el mismo e-NCF y un reenvío aceptado no recontabiliza. Botón
  "Dar de baja" en e-CF → `services/invoice/bajaDeRechazado.ts`: asiento
  contrario con fecha de hoy, CxC retirada (o recalculada si es nota de
  crédito), contramovimiento del cliente y estado `void`. Se niega con cobros,
  conduces, caja, inventario u otros asientos. El reparto del asiento de venta
  vive ahora en `services/invoice/asientoDeFactura.ts`, compartido por emisión y
  baja.
  **Lote 141: el 607 ya no declara rechazados** (TXT y libro de ventas, con una
  sola lista: `services/dgii/estadosReportables.ts`). **Al medir salió que el
  único rechazado de PRODUCCIÓN, `E320000000059`, está ACEPTADO en la DGII**, y
  que `E320000000060` es la misma venta, también aceptada: dos e-CF válidos por
  una venta. **Antes de desplegar**: "Consultar estado" en la 0059 (pasa a
  aceptada; envía el correo de aceptada si el cliente tiene email). La nota de
  crédito que la anule es del contador. Las e-32 de consumo se verifican en
  `fc.dgii.gov.do`, no en `ecf.dgii.gov.do`.
  **Lote 142: el TXT del 607 cumple el Anexo B de la NG 07-2018** (cabecera
  `607|RNC|AAAAMM|cantidad`, 23 campos, importes con punto decimal), armado en
  `services/dgii/formato607.ts`. Antes: id interno en la cabecera, 27 columnas
  y los importes sin punto (×100). **Pendientes del 607, cada uno a medir**:
  NCF modificado vacío en las notas de crédito, fecha en UTC y tipo de
  identificación "3" con RNC vacío.
  **Lote 143: las facturas de consumo (e-32) de menos de RD$250.000 salen del
  TXT** (NG 07-2018 art. 4 y NG 10-18), y la pantalla del 607 da el **Resumen
  General de Facturas de Consumo** para el módulo de la Oficina Virtual. En
  PRODUCCIÓN eran las 31 e-32 de jul–sep. Queda para el contador: si el umbral
  mira el total o el monto sin ITBIS, y qué hacer con las notas de crédito sobre
  una factura de consumo que no va en el detalle (hoy siguen dentro).
  **Lote 145: períodos contables.** Las 6 empresas terminaban el 31/12/2026 y
  nadie abría los siguientes. Botón "Abrir próximos 12 meses" en Contabilidad >
  Períodos, aviso en el panel de inicio con menos de 45 días cubiertos, y crear
  un período a mano ya no admite fechas invertidas ni solapes. **Nada se crea
  solo** (JRN-11): **alguien tiene que pulsar el botón en cada empresa y en cada
  modo antes del 01/01/2027.** "periodo 2026" de Latin Doors sigue ahí, pisando
  septiembre a diciembre. **Las 12 de 2027 de Latin Doors ya se abrieron**
  (PRODUCCIÓN y PRUEBA, a petición del dueño el 2026-09-16); faltan las otras
  cinco empresas si operan.
  **Lote 148: el aviso de comprobante rechazado del panel de inicio sale** (antes
  la consulta excluía `rejected` y el bloque era código muerto).
  **Lote 144: el TXT del 606 cumple el Anexo A** (`services/dgii/formato606.ts`):
  antes era ancho fijo sin "|", 7 datos en vez de 23 e importes ×100. Sin NCF no
  va (decisión del dueño). Servicios/bienes y fecha de pago con la recomendación
  aplicada (cambian en ese módulo). Quedan en blanco, porque el sistema no los
  registra: ITBIS llevado al costo y tipo de retención ISR.
  **Lote 146: una nota de crédito ya no acredita más de lo que queda de su
  factura** (`services/invoice/limiteNotaCredito.ts`, en la validación previa,
  antes de reservar el NCF y de enviar). También se niega una nota sin factura,
  con NCF que no coincide, sobre otra nota o sobre una factura no aceptada.
  **Lote 149: cerrado lo de las notas simultáneas** con una reserva
  (`reservas_nota_credito`) anotada con la factura bloqueada y liberada al
  terminar la emisión. **MIGRACIÓN `drizzle/0007_reservas_nota_credito.sql`:
  aplicarla en la base ANTES de desplegar**, o emitir notas fallará.
  **Lote 150: editar una compra sin cambiar producto, almacén, cantidad ni
  costo ya no toca el kardex**, y el freno de existencia consumida mira lo neto
  (`services/inventario/entradasDeCompra.ts`). El −94 de E310000013249 fue
  anterior al freno del 11/09; con el freno, 6 de 7 compras con inventario no
  se podían editar en nada. En la base no hay CHECK de existencia no negativa.
  **Lote 151: un cobro por banco lleva su cuenta bancaria**, se asienta contra
  ese banco y crea el depósito (pendiente) en el libro de banco
  (`services/cartera/cuentaDelCobro.ts`). **MIGRACIÓN
  `drizzle/0008_cobro_cuenta_bancaria.sql`: aplicarla ANTES de desplegar** (o
  ningún cobro se registra). Desde ese despliegue los depósitos de clientes no
  se meten a mano como "Ajuste". Los 6 cobros por banco anteriores
  (RD$186.093,77 en 1.1.01) son del contador.
  **Lote 152: el asiento del recibo de cobro va por `createJournalEntry`** (era
  la última inserción de asiento a mano): un cobro fechado en un período cerrado
  o sin período se niega entero. Julio de Latin Doors está cerrado desde el
  01/08; sus 8 cobros son anteriores al cierre.
- **Lote 160: los avisos se guardan y hay campana** en la barra de arriba
  (`services/avisos/sincronizarAvisos.ts`, `components/ui/campana-avisos.tsx`).
  `notifications` llevaba 0 filas y nadie la tocaba; ahora cada aviso del panel
  se guarda con clave estable, se actualiza y **se cierra solo** cuando deja de
  aplicar. **MIGRACIÓN `drizzle/0010_avisos_guardados.sql`: aplicarla ANTES de
  desplegar.** "Leída" es de la empresa, no de cada persona (decisión del dueño,
  2026-09-18). La ruta de la campana no pide permiso de módulo, a propósito (la
  ve cualquier usuario): va en `ABIERTAS_A_PROPOSITO` de
  `permisosRutas.vitest.ts`, no en `PENDIENTES`, que es deuda.
- **Lote 169: las salidas de efectivo pasan por la sesión de caja**
  (`services/caja/efectivoDeCaja.ts`). Las ventas y los cobros en efectivo ya
  pasaban; las salidas no. Medido el 2026-09-19 en Latin Doors: 86 compras en
  efectivo (904.351,51) y 2 pagos a suplidores (30.679,84) bajaron la Caja
  General del mayor sin tocar la sesión, y llevar efectivo al banco tampoco.
  La sesión cerrada ese día "esperaba" 2.204.992,49 con 85.000,00 reales.
  Ahora, lo que la operación cambia en el mayor de la caja se apunta igual en
  la sesión (al editar o borrar una compra, solo la DIFERENCIA: una compra
  antigua que se edita sin tocar lo pagado no mueve nada). Sin caja abierta, un
  pago en efectivo se niega, como ya hacían las ventas. **La caja cuadra
  contra dos cosas**: el conteo físico al cerrar la sesión, y 1.1.01.01 Caja
  General en el mayor.
  **Lo que NO entra, y es el siguiente hueco**: una compra "al contado" con
  cheque, transferencia o tarjeta (métodos 02 y 03) **acredita Caja** igual que
  el efectivo, porque la compra no sabe de qué banco sale (el pago a suplidor sí,
  desde el lote 163). Medido: 6 compras con tarjeta, 42.715,67. Por eso el lote
  refleja solo el método 01: si no, habría que abrir la caja para pagar por
  transferencia. **Y el cierre de caja**: las dos sesiones cerradas de Latin
  Doors tienen contado = esperado al centavo y diferencia 0,00; con 85.000
  reales, eso es un cierre sin contar (el importe se puede escribir a mano en
  el campo de monedas). El sistema no lo impide.
- **Lote 170: una compra con cheque, transferencia o tarjeta ya no sale de la
  caja.** Era el hueco que dejó anotado el 169. El asiento era
  `isCredit ? por pagar : CAJA`, y "al contado" para la DGII incluye el cheque
  y la transferencia (02) y la tarjeta (03): una compra pagada por
  transferencia acreditaba 1.1.01 —una cuenta de **agrupación**— y el banco no
  se enteraba ni en su saldo ni en su libro. Medido: 6 compras con tarjeta de
  Latin Doors, RD$49.644,03. **Decidido por el dueño (2026-09-19): el origen se
  ELIGE en cada compra**, porque la tarjeta puede ser de débito (sale de un
  banco) o de crédito (se le debe al banco). La regla vive en
  `services/cxp/origenDeLaCompra.ts` (pura, la comparten ruta, servicio y
  pantalla) y se valida contra la base en `resolverOrigenDeCompra.ts` **antes
  de escribir nada**. El retiro queda en el libro de ese banco, pendiente de
  conciliar (`bancoDeLaCompra.ts`, mismo criterio que el 151 y el 163). Las
  **tres** puertas quedan cableadas: alta, edición/borrado y
  `expenseService.createExpense` (la del POST del 606). Se mueve la
  **DIFERENCIA**: editar sin tocar lo pagado no mueve nada, y cambiar de banco
  le devuelve el dinero al anterior — por eso el origen se **guarda** en la
  compra y no se deduce después. El cálculo "qué dejó este documento en el
  mayor de esta cuenta" sube a `services/contabilidad/efectoEnCuenta.ts`, y
  `efectivoDeCaja.ts` (169) delega en él. **MIGRACIÓN
  `drizzle/0011_origen_de_pago_compra.sql`: aplicarla ANTES de desplegar**, o
  ninguna compra se registra; solo añade columnas. **De paso**: la pantalla
  llamaba "Transferencia" al método **03**, que en el catálogo de la DGII es la
  **tarjeta** (el 02 lleva cheque/transferencia/depósito) — quien pagaba por
  transferencia elegía 03 y el 606 lo declaraba como tarjeta, y el documento
  impreso decía otra cosa. Nombres unificados en `FORMAS_DE_PAGO`. **Para el
  contador**: las 6 compras con tarjeta ya asentadas siguen en 1.1.01; el lote
  no toca lo ya registrado. El banco de integración
  (`verificar_origen_de_compra_db.ts`) **ejecuta las rutas de verdad** con las
  cabeceras internas firmadas (`INTERNAL_API_KEY`): es el único sitio donde se
  puede demostrar que editar mueve solo la diferencia.
- **Lote 168: la campana decía "3" y al abrirla salían 6** (reportado por el
  dueño). No era un error de cuenta: el número rojo son los SIN LEER y la lista
  todos los VIGENTES (leer no resuelve; el aviso sigue hasta que se atiende).
  Ahora la cabecera dice "3 sin leer · 6 vigentes" y la lista separa "Sin leer"
  de "Leídos — siguen pendientes", con el porqué.
- **Lote 167: la pantalla del 606 se caía** con "(e.amount || 0).toFixed is not
  a function" en cuanto el mes tenía una compra (reportado por el dueño el
  2026-09-19). La ruta devolvía los importes de cada fila como texto (las
  columnas `decimal` llegan así) y solo convertía los totales. Escondido hasta
  el lote 134, porque antes la ruta respondía 403 siempre. El 607 ya convertía.
- **Lote 166: la base DESECHABLE para los 33 bancos de integración**
  (`scratch/bancos_db/`). Estaban en `deuda_bancos.txt` sin correr porque
  ESCRIBEN (hasta `TRUNCATE` de todo lo transaccional). Ahora: un cluster
  propio de PostgreSQL 18 en 127.0.0.1:55432, fuera del repositorio
  (`%LOCALAPPDATA%\contfast_bancos`), con **candado** (`candado.ts` +
  `precarga.mts`: si `DATABASE_URL` no es esa base con su marca, el banco no
  arranca; `_limpieza.ts` y la semilla también lo exigen). `base_desechable.ps1
  -Accion correr` migra, completa el esquema (las migraciones NO lo reproducen:
  `average_cost` y `unit_cost` se crearon a mano en P1-12 —
  `complemento_esquema.sql`, y `deriva_esquema.ts` falla si aparece otra
  columna así), siembra (la semilla original nunca se commiteó: reconstruida
  en `semilla.sql` + `semilla_app.ts`, que usa los sembradores de la
  aplicación) y corre los 33, resembrando antes de cada uno. **33/33 en verde.**
  `verificar.ps1` los corre en su paso 3b si hay PostgreSQL 18. Destaparon dos
  defectos reales (lotes 164 y 165) y mucha deriva, arreglada sobre la
  PROPIEDAD, no la forma: rutas que delegan en servicios (`correoFactura.ts`,
  `addStock`), `{ entries, total }`, `hayFirma` (la firma exige aceptación), el
  esquema de productos en `schemas/producto.ts`, `npx` que en Windows no se
  lanza con `execFileSync`… Y un hueco sin arreglar: **la factura de PRUEBA se
  imprime igual que la real** (la marca de agua solo existía en la plantilla
  del módulo retirado en el lote 100); está anotado en
  `verificar_modo_obligatorio.ts`.
- **Lote 165: las cuentas que el sistema busca existen en toda empresa**
  (`services/accounting/cuentasDelSistema.ts`, una sola tabla para el
  sembrador y para los códigos por defecto). Compras y facturas pedían 7
  claves que el catálogo sembrado no traía (1.1.08, 2.1.04, 2.1.05, 1.1.05,
  5.1.02 inexistentes; 1.1.03 y 1.1.04 de agrupación): **Artalum, D'JIMENEZ,
  J'EDWARD y UltraElec no podían registrar una compra con ITBIS**, ni con
  retenciones. `src/tests/cuentasDelSistema.vitest.ts` falla si vuelven a
  separarse. `completarCuentasDelSistema` completa una empresa existente sin
  mover saldos (decisión del dueño: si una cuenta antigua tiene movimientos,
  la clave se engancha a ella — Latin Doors sigue en 1.1.08, 2.1.04, 2.1.05).
  **Datos**: `scratch/_to_delete/completar_cuentas_empresas.ts --aplicar` (lo
  lanza el dueño); desbloquea las cuatro empresas aunque aún no se despliegue,
  porque el código desplegado mira primero el enlace.
- **Lote 200: los avisos salen por CORREO, y se retira el canal de WhatsApp** que nunca
  entregó ninguno. Decisión del dueño (2026-09-26) al final de una cadena que empezó con
  «los avisos no me llegan».
  **Lo que costó verlo**: para llegar al motivo hubo que arreglar antes tres cosas que lo
  tapaban — el 196 (el motivo del rechazo se tiraba), el 197 (la causa del 500 viajaba en
  `cause`) y el 199 (`void` no termina en serverless). Con los tres puestos apareció:
  `HTTP 400: (#131037) WhatsApp provided number needs display name approval`. Y al
  **consultar a Meta** por el número: la cuenta tiene **uno solo**, `+1 555-346-2012`,
  que es el de **PRUEBA** que regala Meta. No manda nada — ni plantilla ni texto libre,
  con la ventana de 24 h abierta (probado con un envío real) o cerrada. Arreglarlo exigía
  dar de alta un número propio: **un trámite, no código**.
  **Y me equivoqué dos veces** interpretando ese error antes de medirlo bien (primero el
  nombre, luego el texto libre). La lección: el mensaje de un proveedor se lee, pero su
  **estado se consulta**.
  Ahora: `services/avisos/avisoPorCorreo.ts` (puro) decide qué sale y cómo se escribe —la
  empresa **en el asunto**, porque quien administra varias las recibe todas en la misma
  bandeja—, y `enviarAvisosPorCorreo.ts` hereda las tres garantías del 178 (no lanza,
  marca **lo que salió**, sin dirección no consulta nada) más la del 196 (lo que falla por
  configuración no se repite). Con `after()` del 199.
  Campo **Correo de destino** en Configuración, recorriendo los **seis** sitios del ajuste
  —incluida **la escritura en la columna**, que es lo que el 178 dejó a medias—.
  **MIGRACIÓN `drizzle/0015_avisos_por_correo.sql`: aplicarla ANTES de desplegar** (solo
  añade dos columnas).
  **Se van**: `whatsappKapso`, `enviarAvisosPendientes`, `plantillaDeAviso`,
  `avisoPorWhatsApp`, `rechazoDeWhatsApp`, el campo, su ajuste y las variables `KAPSO_*`
  (borradas de Vercel), más `DGII_API_KEY`, que el 198 dejó sin uso. **No se van las
  columnas** `whatsapp_enviado_at` ni `whatsapp_avisos`: quedan **reservadas con su dato**
  —hay un aviso que sí salió el 24/09—, mismo criterio que el lote 107 con `voided_by`.
  **Los bancos, que es lo que más cuesta al retirar** (lección del lote 100): se retiran
  con el canal los que solo lo vigilaban (178, 179/184/186, 188, 196) y se **adaptan** los
  que cubrían dos asuntos — el 187 conserva el orden de las tarjetas y que guardar relea
  lo guardado; el 199 apunta al canal de correo y su trinquete sigue barriendo las 182
  rutas. En el banco nuevo, dos comprobaciones se **reescriben en vez de borrarse**: las
  que decían «los dos canales van por separado» pasan a decir que el correo es el único y
  que lleva **su** marca, que es lo que impide mandar dos veces el mismo aviso.
  **Pendiente del dueño**: dar de baja las credenciales en Kapso y en el proveedor de la
  API de RNC — borrar la variable **no** revoca la clave.
- **Lote 199: los avisos se mandaban DESPUÉS de responder, y en serverless eso no
  ocurre.** Dos síntomas que juntos señalan al mecanismo: en PRODUCCIÓN los 7 avisos
  seguían **sin marca de envío** y en los registros no había **ni una** línea
  `[avisos-whatsapp]` —ni de éxito ni de fallo—, mientras en **local esas mismas líneas
  sí salían**. Un envío que no ocurre *y que tampoco se queja* no es un fallo del
  proveedor: es código que no llega a correr.
  **Descartado antes de mirar el mecanismo**: `sincronizarAvisos` sí había corrido (las
  filas quedaron tocadas al abrir el panel), el número está configurado y
  `normalizarNumero` lo acepta —ese camino también devuelve lista vacía en silencio y
  era el primer sospechoso—, y los cuatro avisos de PRODUCCIÓN calificaban por
  severidad.
  **La causa**: `void enviarAvisosPendientes(...)`. En una máquina de desarrollo el
  proceso sigue vivo y la tarea termina; **en serverless Vercel congela la función al
  devolver la respuesta**, así que la petición se cortaba a medias y ni sus líneas de
  registro se volcaban. La intención del lote 178 era correcta (que el panel no espere
  a WhatsApp); el mecanismo no funciona donde esto corre.
  **La cura**: `after()` de `next/server` —lo que `void` prometía: corre después de
  responder, manteniendo la función viva—. Sin dependencias nuevas.
  **Y un trinquete**, porque el próximo `void` tampoco avisará: el banco barre las
  **182 rutas de API** y los servicios buscando `void <llamada>(`. Hoy no queda
  ninguno; dos casos tolerados y anotados (`barrerViejos` del 183 y `triggerFallback`
  de la cola). Banco de 7, contraprueba 0 OK, cinco mutantes y cinco muertos —incluido
  el que mete un `void` nuevo en **otra** ruta, que es para lo que existe el trinquete.
- **Lote 198: la consulta de RNC vuelve a funcionar** — el proveedor había
  desaparecido y el servicio de la DGII está retirado. El dueño reportó que "buscar
  RNC" daba error en clientes y suplidores.
  **No era nuestro código ni la clave**: se llamaba a
  `pptonanntevatndjyzmk.supabase.co` —un proxy de **terceros**, no la DGII— y ese
  nombre **ya no resuelve en DNS** (`ENOTFOUND`). Y el mensaje, "Error de red al
  consultar DGII", **mentía dos veces**: no era la DGII y no era pasajero.
  **El servicio web de la DGII también está retirado**: `wsMovilDGII` contesta **301
  hacia su portal** (un POST SOAP devuelve 476 KB de la página) y `api.dgii.gov.do` no
  resuelve. Lo único vivo es el formulario web y **el padrón descargable**.
  Decisión del dueño (2026-09-26): el padrón. `drizzle/0014_padron_de_rnc.sql` +
  `rnc_padron` (**aplicarla y CARGARLA**: nace vacía), sin `company_id` —dato público,
  el mismo para las seis empresas— y con el **RNC como clave primaria**, que es lo que
  hace que reimportar actualice en vez de duplicar.
  **La forma del fichero se MIDIÓ, no se supuso** (la lección de la plantilla de Kapso,
  que costó tres lotes): 21,8 MB de zip → `TMP/DGII_RNC.TXT` de 86,5 MB, 791.412
  líneas, separador `|`, once campos, **latin-1**, sin cabecera. Y **la DGII devuelve
  403 a quien no parece un navegador**, con una página de "Acceso Denegado" de 6 KB:
  el guion manda `User-Agent` de navegador y comprueba **la firma del ZIP**, porque
  mirar el tamaño no distingue un padrón de un 403.
  La consulta lee la tabla: **sin terceros y sin clave**, y si un RNC no aparece **dice
  de cuándo es el padrón** («cargado el 26/09/2026») — un contribuyente registrado la
  semana pasada existe, y decir «no existe» sería falso. Un RNC suspendido **se
  encuentra** y se advierte con la palabra de la DGII.
  **No se actualiza solo** (decisión del dueño): lo importa él, como los demás guiones
  de datos, frente a una tarea de GitHub Actions —que obligaría a poner
  `DATABASE_URL` como secreto del repositorio— o un cron de Vercel, sitio equivocado
  para 791.412 filas con 300 s. Lo que evita el olvido es un **aviso del panel a los 30
  días**, con severidad `info` a propósito: `severidadDeAviso` manda al teléfono los
  `error` y los `warning` (lote 178), y esto es mantenimiento.
  **Aplicado en PRODUCCIÓN el 2026-09-26**: 791.373 filas en 103 s, la tabla pesa **129
  MB** (la base entera pesaba 23 MB: es lo que cuesta no depender de nadie). Probado de
  punta a punta: activo, suspendido y dado de baja con su advertencia, y **~100 ms**
  frente a una petición con 30 s de plazo.
  Banco de 35, contraprueba 0 OK de 24, **17 mutantes y 17 muertos**. Uno era grave:
  **las tres filas reales con las que empecé no distinguían** leer el estado desde el
  final de leerlo por posición —en las tres coincidía—, así que un mutante que lo leía
  por posición sobrevivía y lo comprobado era una casualidad del fichero de hoy. Hizo
  falta una fila de **doce** campos. Queda anotada la salvedad: contar desde el final
  aguanta una columna metida en medio, **no** una añadida al final.
  Y por **cuarta vez en el día**, la prosa hizo pasar una comprobación: el docstring
  del guion explica que usa `on conflict do update`, así que buscarlo en el texto pasaba
  aunque el SQL dijera otra cosa. **Se mide el código, no el texto.**
  De paso: `scratch/_to_delete/aplicar_migracion.ts`, porque las migraciones se aplican
  a mano y no había guion para hacerlo (`run-sql.ts` es de un arreglo puntual con dos
  columnas escritas dentro).
- **Lote 196: un aviso que no sale dice por qué, y no se repite cinco veces.** El dueño
  pasó el registro de una sesión del 2026-09-25 con cinco líneas iguales por cada carga
  del panel: `no salio un aviso ... motivo: 'HTTP 422'`. Dos defectos, y ninguno era la
  plantilla:
  - **El motivo se tiraba a la basura.** `datos?.error?.message || `HTTP ${status}``
    solo sabe leer la forma de error de **Meta**, y Kapso contesta con otra: quedaba
    "HTTP 422" y **la causa venía en el cuerpo, que se descartaba**. Es la lección del
    lote 185 otra vez. `motivoDelRechazo` prueba las formas conocidas por orden y, si
    ninguna encaja, **copia el cuerpo recortado**; el estado va siempre delante, que es
    lo que permite clasificar (un 422 se arregla cambiando la petición, un 503
    esperando). **Se recorta a 200 caracteres y no es cosmética**: un cuerpo de error
    puede devolver la petición entera, y esa lleva el teléfono del destinatario.
  - **Se reintentaba igual cinco veces.** Todos los avisos de una empresa salen con la
    misma clave de API, el mismo número y la misma plantilla, así que un 4xx en el
    primero ya dice cómo acaban los otros cuatro. `esRechazoDeTodos` decide por el
    **estado** y no por el texto (los textos los cambia el proveedor): 4xx corta, 5xx y
    «sin respuesta» no. **408** no corta (es del momento) y **429** sí, pero por el
    motivo contrario: insistir lo empeora. Al cortar se dice **cuántos quedaron sin**
    **intentar**, o el registro daría una cifra falsa.
  **Lo que NO hace**: un aviso rechazado no se da por perdido — no se marca, así que la
  siguiente carga lo reintenta. Sin plantilla configurada el texto libre solo se acepta
  dentro de las 24 h desde que esa persona escribió al número, así que el mismo aviso
  puede salir mañana sin que nadie cambie nada. Lo que se corta es repetir la petición
  **dentro de la misma pasada**.
  **La causa del 422 de ese registro, medida**: en el `.env` local no está
  `KAPSO_PLANTILLA_AVISO`, así que el aviso sale como texto libre y Meta lo rechaza
  fuera de la ventana. Es configuración, no código — pero ahora el registro lo dirá con
  palabras en vez de con un número.
  Banco de 24 (las dos reglas ejecutadas), contraprueba 0 OK de 11, **12 mutantes
  muertos y 1 equivalente anotado en el código** (quitar la línea del 429 no cambia el
  comportamiento, porque ya cae en el 4xx; se deja escrita porque dice una intención
  distinta). Dos mutantes apretaron el banco: uno dejaba `sinIntentar = 0` conservando
  el nombre —mera presencia— y otro quitaba el recorte del cuerpo (5.010 caracteres).
- **Lote 195: el menú leía el navegador mientras se pintaba** — error de hidratación
  en cada carga, y **un banco lo defendía**. Reportado por el dueño el 2026-09-25, y
  era mío: de los lotes 189 y 191.
  Las dos preferencias del menú se leían en el **inicializador** del `useState`
  (`useState(() => (typeof window === 'undefined' ? {} : leerGruposGuardados()))`), así
  que el servidor pintaba todo plegado y el navegador otra cosa: React tiraba su árbol
  y **reconstruía el menú entero en cada carga de cada pantalla**. Medido: en todo
  `src/` **solo esos dos sitios** lo hacían; el resto ya leía `localStorage` en un
  efecto.
  **Y el banco del 189 exigía el defecto**: `ok('  y se lee al arrancar, no despues')`,
  con un comentario justificándolo. **Se invierte, no se borra** — mismo criterio que
  el p2_28_31 de los lotes 114-118.
  La cura conserva lo que el 189 quería: `hooks/usePreferenciaDelNavegador` deja el
  valor de partida igual en los dos lados y restaura la preferencia en un
  **`useLayoutEffect`** — después de montar y **antes de que el navegador pinte** —,
  así que el HTML coincide y **nadie ve el menú plegado**. La cura de manual
  (`useEffect`) habría arreglado la hidratación devolviendo el parpadeo. Que en el
  servidor se use `useEffect` **no** es el defecto de antes: ahí `typeof window` decide
  qué hook se usa, no qué se pinta.
  Una guarda que no es teórica: **no se escribe nada hasta haber intentado leer**; si
  el efecto que guarda corriera primero, escribiría el valor de partida y **borraría la
  preferencia justo antes de leerla**.
  `utils/preferenciasDelMenu.ts` (puro) se queda con la validación de lo guardado, que
  antes vivía dentro del componente y solo se podía comprobar **leyendo el texto** del
  fichero. De paso queda dicho algo que no estaba: `null` es «no hay preferencia» y
  deja el valor de partida en pie, mientras que **vacío sí es una preferencia** («lo
  dejé todo cerrado»).
  Banco de 21, contraprueba **0 OK de 15 sin un superviviente**, diez mutantes y diez
  muertos. Dos apretaron el método:
  1. Quitar el `try` del `JSON.parse` hacía que la comprobación **lanzara** y el banco
     abortara en vez de reportar FALLA: el mutante quedaba como «no se puede
     concluir». Ahora se atrapa — si lanza, es que falla.
  2. Darle a los favoritos **la clave de los grupos sobrevivió**: esa propiedad solo la
     vigilaba el banco del 191 y es del mecanismo que se estrena aquí. Compartir clave
     no daría ningún error: abrir un grupo **borraría las anclas**, en silencio.
  **Confirmado en la práctica** (no solo por estructura): con `pnpm dev` reiniciado y
  recarga completa, ni una línea de `Hydration failed`.
  **Ojo con `alcanceStorefront.vitest.ts`**: vuelve a agotar su `beforeAll` (10 s) bajo
  carga — la transformación pasa de 535 ms a 11 s. Solo, 27/27 en 2,5 s. Es contención,
  y ya van dos veces en la misma sesión.
- **Lote 194: el grupo que abres sube arriba** (pedido del dueño, 2026-09-25).
  Pulsar un grupo de la mitad de abajo —Sistema, Finanzas, RRHH— abría su submenú
  **debajo del pliegue**: pulsabas para desplegar y el despliegue no se veía.
  **Lo que ya había no lo resolvía**: el `scrollIntoView` del 189 trae el elemento
  **ACTIVO** con `block: 'nearest'` (mover lo menos posible), que es lo contrario de
  «llévalo arriba» — y el activo puede estar en otro grupo.
  `src/utils/grupoRecienAbierto.ts` (puro) decide qué grupo se acaba de abrir, y ahí
  están las dos decisiones que se pueden equivocar: **al abrir se sube, al cerrar**
  **no** (cerrar no esconde nada; mover el menú entonces se lo lleva de debajo del
  ratón) y **lo que ya estaba abierto no vuelve a subir** (si no, cualquier cambio en
  otro grupo subiría el primero abierto).
  Tres cosas del componente que no se ven en el resultado:
  - **El orden de los dos efectos importa y no es estilo.** Los dos reaccionan al
    mismo cambio y piden cosas contrarias (`nearest` contra `start`); React ejecuta
    los efectos en el orden en que están escritos, así que el último deja el scroll
    donde queda. **Intercambiarlos rompe el lote sin que falte una línea**, y por eso
    el banco vigila el orden (mutante comprobado).
  - **`abrirGrupo` no sube nada**: el grupo de la página actual se abre solo en cada
    navegación, y si eso subiera el menú, entrar a cualquier pantalla daría un salto
    que nadie pidió. Solo sube lo que se abre con el dedo.
  - **El aviso lleva un sello que cambia en cada clic y no se consume**: sin sello,
    abrir dos veces el mismo grupo no cambiaría el valor y el segundo clic no subiría
    nada; y no se puede limpiar tras usarlo porque hay **dos instancias** del
    componente y la primera en correr se lo quitaría a la otra.
  Banco de 15, contraprueba 0 OK, nueve mutantes y nueve muertos. Cuatro
  comprobaciones sobrevivieron y se apretaron: dos negaciones ciertas de balde y dos
  propiedades verdaderas en los dos estados, que pasan a **precondición** — así el día
  que alguien se las lleve, el banco no da FALLA: se niega a correr.
- **Lote 193: el selector de empresa sube a la cabecera** (pedido del dueño,
  2026-09-25). El nombre de la empresa estaba **dos veces** —texto plano en la
  cabecera y dentro del selector, en el pie del menú— y el único sitio donde se
  cambia era el que menos se ve: **con el menú plegado desaparecía**, quedaba un
  cuadrito con la inicial sin `onClick`.
  **Medido (PRODUCCIÓN, 2026-09-25)**: de 9 usuarios, **6 son `administracion`** y
  solo 1 es `sistemas`. Para esos 6 el selector nunca fue un selector: es el nombre
  de la empresa. Y los nombres de rol están **todos en minúsculas**, así que la
  comparación estricta se conserva: **este lote no cambia quién puede cambiar de**
  **empresa**, aunque otras pantallas acepten además `'sistema'` y sin mayúsculas
  (`admin/sessions`, `admin/users`, `dashboard/admin`). Si algún día aparece un rol
  así, el sitio a tocar es uno: `src/utils/cambioDeEmpresa.ts`.
  Ese fichero (puro) lleva `puedeCambiarDeEmpresa` e `inicialDeEmpresa`; la segunda
  arregla algo real: `companyName.charAt(0)` daba **cadena vacía** mientras los
  ajustes no habían llegado, y en la cabecera ese círculo en blanco se ve mucho más
  que en el pie del menú.
  **El nombre va completo** (pedido después de ver la primera versión): recortarlo
  dejaba "LATIN DOO...", y con seis empresas el nombre a medias no dice en cuál
  estás — es el dato que evita emitir una factura en la empresa equivocada. Lo que
  cede en una pantalla estrecha es el **logo**, no el nombre.
  El punto del entorno pasa a la **izquierda de la campana y pegado** (grupo propio
  con hueco 1,5; antes flotaba entre la campana y el avatar con el hueco 4).
  El sidebar pierde `user`, `companies`, `companyName`, `onSwitchCompany` y
  `switching` —todas del selector— y el panel de diagnóstico pierde la línea "Rol
  Prop": comparaba el rol del *prop* con el del contexto, y ya no hay dos fuentes.
  Banco de 26, contraprueba 0 OK, **trece mutantes y trece muertos**. Dos cosas
  apretaron el método:
  1. `/if \(!sePuede\)/` en todo el fichero **sobrevivió** al mutante que vaciaba la
     guarda, porque el `useEffect` que cierra el menú lleva ese mismo texto — mera
     presencia otra vez. Ahora se acota a la rama y se exige que no tenga `<button`.
  2. **Una tanda entera salió "11 de 11" con el banco ROTO** por un `
` que escribí
     a mano y se convirtió en salto de línea real: un banco que revienta parece matar
     cualquier mutante. **El lanzador de mutantes ya distingue "dio FALLA" de "no**
     **arrancó"**, y eso vale para todos los lotes que vengan.
  Y `verificar_entorno_y_sesion.ts` (192) se puso en rojo por este lote: exigía la
  insignia **después** de la campana. Deriva, no regresión — re-anclado a la
  **adyacencia**, que es la propiedad, y verde en los dos estados.
- **Lote 192: cerrar sesión dentro del avatar, y el entorno al lado de la campana**
  (pedido del dueño, 2026-09-24). Al ir a hacerlo salió lo que no se pedía:
  - el **mismo dato se enseñaba TRES veces en PRUEBA** —la franja rayada de arriba,
    una pastilla "SANDBOX" junto a la campana y el pie del menú— y **una sola en
    PRODUCCIÓN**: el pie del menú, que es justo el que se iba. La pastilla era este
    mismo punto con etiqueta, así que se retira con él;
  - `entorno` y `activeEnvironment` **son el mismo valor** (`ClientLayout` los fija
    en la misma vuelta desde `initialSettings.dgiiEnv`), y **`CERT` es rama muerta**:
    todo lo que no es PRODUCCION cae en PRUEBA y CERTIFICACION ya no se puede
    guardar. Se mantiene en la regla para que un valor inesperado no se quede sin
    rótulo;
  - **el avatar prometía un clic que no hacía nada**: `cursor-pointer` y
    `hover:scale-105` sin un solo `onClick`.
  `src/utils/entornoVisible.ts` (puro) decide qué texto y qué color le toca a cada
  entorno. **El detalle dice la CONSECUENCIA**, no el nombre otra vez: "Pruebas" no
  le dice a nadie que lo que emita no vale ante la DGII. Y lleva **dónde se cambia**,
  porque la pastilla retirada lo explicaba con un toque: ese dato pasa al globo, que
  sale sin pulsar. El color **no es información** para quien no lo distingue ni para
  un lector de pantalla, así que el rótulo va también en `aria-label` y
  `role="status"`; sin `title`, o saldrían dos globos.
  El menú del avatar se cierra con **Escape y pulsando fuera**, y el oyente de
  Escape **solo está puesto mientras está abierto** (si no, se tragaría el Escape de
  los diálogos de toda la aplicación). El nombre y el rol van **dentro** además de al
  lado, porque al lado están ocultos por debajo de `sm:`: en el móvil es el único
  sitio donde comprobar con qué cuenta se trabaja.
  **Lo que NO hace, a propósito**: la **franja de MODO PRUEBA se queda** (dice que
  las operaciones son fiscalmente nulas: advertencia legal, no adorno) y va de
  **precondición** en el banco, no de comprobación — si alguien la retira, el banco
  no dará FALLA: se negará a correr. Y **cerrar sesión sigue sin pedir**
  **confirmación**, como estaba.
  Banco de 28, contraprueba 0 OK, **diez mutantes y diez muertos**. Uno sobrevivió y
  apretó el banco: dejar vacío el `onClick` del avatar pasaba, porque
  `onClick={() => setAbierto` **también lo cumple la capa que cierra al pulsar**
  **fuera** — se miraba otro clic. Y cuatro comprobaciones sobrevivieron a la
  contraprueba: dos negaciones ciertas de balde (sin el fichero no hay `title` ni
  `confirm` porque no hay nada) y dos propiedades verdaderas en los dos estados, que
  pasan a precondición.
  **De paso**: `verificar_sidebar_fluido.ts` (189) estaba en rojo por el 191 —
  contaba los `<NavItem` del fichero y exigía que todos llevaran `refActivo`, y el
  191 añadió un tercero que a propósito no lo lleva. Deriva, no regresión: re-anclado
  a los enlaces **de los grupos**, que son los que pueden quedar bajo el pliegue.
- **Lote 191: los favoritos anclados — cincuenta elementos de menú para cinco
  pantallas al día.** Sugerencia 5 de las seis que se midieron el 2026-09-24,
  elegida por el dueño. El 189 hizo que el scroll se vea y que lo que dejas abierto
  se recuerde, pero el menú **sigue siendo grande**; y se sabe cuáles son los cinco
  que importan porque están contados en PRODUCCIÓN: `inventory_movements` 476,
  `expenses` 113, `invoices` 88, `products` 87, `delivery_notes` 70, frente a
  `employees` 1 y `credit_debit_notes` 0.
  **Anclar y no "recientes"** (decisión del dueño): los recientes no hay que
  configurarlos, pero cambian solos — el menú se mueve debajo del ratón.
  `src/utils/favoritosDelMenu.ts` (puro): orden de **anclado**, no alfabético, y
  lista nueva en cada cambio, porque mutar el estado de React no repinta. Lo
  anclado **se cruza con lo que cada uno puede ver**: un permiso retirado dejaría
  un enlace a un 403 en el sitio más visible del menú, y un ancla a una ruta que ya
  no existe sobrevive en el navegador (pasó: el lote 100 retiró el módulo de
  documentos). El ancla **no se borra** por eso; si el permiso vuelve, sigue ahí.
  El estado vive **en el padre** por lo mismo que los grupos del 189 (dos
  instancias) **y** porque el buscador lo necesita: con la caja vacía ofrece lo
  anclado primero, en vez de `allItems.slice(0, 7)` — los siete primeros del menú,
  que para quien abre Ctrl+K es un orden arbitrario. Se guarda en el **navegador**,
  como los grupos: quien entre desde otro ordenador empieza sin anclas.
  **La estrella va FUERA del `<Link>`**: un `<button>` dentro de un `<a>` no es
  solo HTML inválido — el clic navega igual, porque el enlace es el ancestro y
  recibe el evento, así que anclar te sacaría de la página. Y la copia anclada
  **no lleva `refActivo`**: el elemento activo sale dos veces y es un solo `ref`;
  si lo llevaran los dos, el `scrollIntoView` del 189 dejaría de traer a la vista
  la fila del grupo, que es la que puede estar bajo el pliegue.
  Banco de 46 comprobaciones (18 ejecutando las reglas), contraprueba 0 OK, siete
  mutantes muertos. **Uno apretó el banco**: contar `favoritos={favoritos}` en todo
  el fichero daba dos apariciones aunque al cajón móvil le faltara, porque el
  buscador también lo recibe; ahora se mira cada `<SidebarContent>` por separado.
  **Queda del menú**: RRHH enseña 8 elementos para 1 empleado, y
  `credit_debit_notes` tiene 0 filas.
- **Lote 190: el buscador repetía una pantalla que tiene dos permisos — y la iba a
  "arreglar" borrando una fila.** Al medir el menú salió
  `/dashboard/antiguedad-saldos` **dos veces** en `route_mappings`, con el mismo
  nombre y el mismo grupo. Iba a proponerlo como arreglo de DATOS y **me
  equivocaba**: difieren en el **módulo de permisos** (`cobros` y `proveedores`),
  a propósito, para que la vean los dos roles. Borrar una le habría quitado la
  entrada del menú a un rol entero, sin aviso, y en las **seis** empresas, porque
  `route_mappings` no tiene `company_id`. Y el sidebar **no** la duplicaba
  (`seenHrefs`, de antes): el que la repetía era el buscador de Ctrl+K. El defecto
  era de código y mucho más pequeño de lo que parecía: `unaEntradaPorRuta` en
  `src/utils/menuSinRepetidos.ts`.
  **La lección del lote, y por eso la regla vive fuera del componente**: la primera
  versión la tenía dentro del sidebar y el banco la **reimplementaba** para
  "ejecutarla". La contraprueba dejó **cinco comprobaciones en OK**, con razón:
  comprobaban mi copia, no el código, y ningún mutante las mataba.
  **Datos, pendiente de que lo lance el dueño**:
  `scratch/_to_delete/renombrar_menu_ambiguo.ts --aplicar` — dos nombres del menú
  están usados por dos pantallas distintas cada uno ("Cuentas por Pagar" →
  "Pagos a Suplidores" para `/dashboard/ap`, que es donde se paga; "Ajustes" →
  "Ajustes de Inventario"), más "Ajustes" → "Configuración" en
  `/dashboard/settings`, pedido por el dueño. Ensayo limpio; **no borra ninguna
  fila**.
- **Lote 189: el sidebar deja de esconder lo que hay.** El dueño lo describió así:
  *"tiende a ocultarse y hay que hacer scroll para buscar y seleccionar"*.
  **Medido**: 50 elementos de menú en 9 grupos — 59 filas con todo abierto, así que
  el scroll no se puede quitar. El problema era que estaba **a ciegas**:
  - la **barra de scroll estaba oculta a propósito**
    (`[&::-webkit-scrollbar]:hidden`): nada decía que hubiera más abajo ni había
    barra que agarrar;
  - **no había un solo `scrollIntoView`** en 725 líneas, así que la pantalla actual
    podía quedar bajo el pliegue y había que buscarla a mano en cada navegación;
  - `expandedGroups` era un `useState` **sin persistencia dentro de
    `SidebarContent`, del que hay DOS instancias** (escritorio y cajón móvil): al
    recargar se plegaba todo, y el móvil **empezaba plegado cada vez que se abría**.
  El estado **sube al padre** (una sola verdad) y **se recuerda** — decisión del
  dueño, frente a abrir todo o uno a la vez. Leer la preferencia nunca puede romper
  el menú, y solo se aceptan booleanos.
  **El buscador (Ctrl+K)**: flechas con vuelta en los extremos, Enter, y búsqueda
  **sin tildes** (`name.toLowerCase().includes(...)` dejaba fuera lo que nadie
  escribe con acento) y **por grupo**. La comparación vive en
  `utils/buscarTexto.ts`, fuera del sidebar, porque **el mismo problema lo tiene
  cualquier filtro por nombre**. La columna derecha pasa de la URL cruda al grupo.
  **Un mutante obligó a apretar el banco**: quitar la **llamada** que guarda la
  preferencia sobrevivió, porque la comprobación miraba que `guardarGrupos`
  existiera — y seguía ahí con su `setItem`. **Mera presencia otra vez.** Y `tsc`
  cazó lo que el banco no ve: al subir el estado, la segunda instancia se quedó sin
  las propiedades nuevas.
- **Lote 188: máscara al escribir el número de los avisos, y aviso en el momento.**
  Antes un número mal puesto no se sabía hasta pulsar Guardar, y el servidor
  contestaba un 400: el aviso llegaba tarde y lejos del campo.
  **La regla no se escribe dos veces**: el diagnóstico usa `normalizarNumero`, la
  misma con la que el servidor decide. El banco recorre diez casos y exige que
  **nunca discrepen** — si discreparan, la pantalla diría "correcto" y el servidor
  400, o peor, al contrario.
  **La máscara se aparta cuando no sabe**: agrupa lo dominicano (809/829/849, con
  o sin el 1) mientras se escribe, y deja tal cual un `+`, un área que no es de RD
  o un número largo sin código de país. No conocemos el formato de los demás
  países, y una máscara que adivina causa más errores de los que evita.
  El aviso dice **cómo saldrá** el número (`Se enviará a +18095551234`), que es el
  dato que nadie puede comprobar de otra forma. **Vacío no es un error** — es el
  estado de las seis empresas. **No se bloquea Guardar**: el campo es opcional.
- **Lote 187: el ajuste de los avisos estaba escondido, y guardar no reflejaba lo
  guardado.** Dos cosas, las dos reportadas por el dueño.
  - **"¿En qué parte se configura el número?"** Estaba dentro de la tarjeta
    *Configuración de Códigos de Barra*: el lote 178 lo metió ahí porque aquella
    rejilla de tres columnas tenía un hueco libre — por comodidad al escribir el
    código, no por criterio. **Un ajuste que no se encuentra es un ajuste que no
    existe.** Ahora vive en **Identidad Fiscal, debajo del logo**, en un bloque
    propio con `mt-6` y borde: sin esa separación parece un campo más de la
    identidad de la empresa.
    Y la pantalla **dice si el sistema puede mandar**: el número se configura en
    la aplicación, pero hacen falta `KAPSO_API_KEY` y `KAPSO_PHONE_NUMBER_ID`, que
    se ponen en Vercel y no se ven desde aquí. El motivo lo calcula el servidor
    con `motivoParaNoMandar()` y **nombra la variable, nunca su valor**. Ojo con
    el límite de esa luz verde: comprueba que estén PUESTAS, no que sean
    correctas.
  - **Guardar no releía nada.** La pantalla se quedaba con lo ESCRITO, no con lo
    GUARDADO — y no son lo mismo: el servidor recorta espacios, convierte vacío en
    nulo y puede rechazar un valor. Ahora llama a `fetchSettings()` tras
    confirmar el guardado; con eso y no con `location.reload()`, que perdería la
    pestaña y parpadearía.
  **La contraprueba cazó CINCO comprobaciones ciertas de balde**, todas del mismo
  lote: `indexOf` de una tarjeta que aún no existe da −1 (así que "el campo va
  después" se cumplía siempre), tres textos ya existían en la tarjeta equivocada y
  se miraban en el fichero entero, y dos negativas son verdad antes de que el
  mecanismo exista. **Cura: acotar al bloque, y atar cada negativa a una marca
  positiva.** Y el `indexOf` volvió a morder: la rebanada de `handleSave` cazaba
  `handleSaveType`.
- **Lote 186: la plantilla definitiva tiene SIETE huecos y es UTILITY.** El dueño
  la recreó como **`notificacion_operativa`** (UTILITY, es_MX), que es la
  categoría que corresponde a un aviso operativo — la anterior era MARKETING y
  eso depende de que el destinatario no la haya bloqueado. Pero no es la misma con
  otra etiqueta: **aparece `referencia`**, un séptimo hueco.
  **Tres veces seguidas la plantilla no era la que se creía** (179: cinco, los
  que dijo el dueño; 184: seis, `empresa` propia; 186: siete, con `referencia`),
  y las tres el síntoma habría sido el mismo — **132000 y ni un aviso**, visible
  solo en el registro. **Regla, ya sin excusa**: leer la plantilla de
  `GET /meta/whatsapp/v24.0/{waba}/message_templates` **y** comprobarla con un
  envío real antes de darla por buena.
  `referencia` lleva la **clave estable del aviso** (`caja-diferencia-<id>`,
  `declaracion-606-202608`), la misma de `notifications.clave`: así quien recibe
  el mensaje y quien mira la base hablan del mismo aviso.
  **Al desplegar**: `KAPSO_PLANTILLA_AVISO = notificacion_operativa`. El idioma
  `es_MX` ya es el valor por defecto.
- **Lote 185: dos logs que señalaban al sitio equivocado.** No es cosmética: el
  ruido de los registros de PRODUCCIÓN mandó a buscar el defecto del recibo donde
  no estaba.
  - `[Queue] Timeout adding job to … Redis is likely offline` salía **sin que
    nadie hubiera esperado nada**: `addJob` armaba su `setTimeout` de 1.500 ms
    antes de comprobar si existe la cola y no lo cancelaba al salir por el camino
    rápido — el normal desde que se retiró `REDIS_URL`. En serverless ese aviso
    se atribuye a **la petición que esté corriendo en ese momento**: aparecía
    dentro de una impresión de factura. Ahora el reloj se arma donde se usa y se
    cancela en un `finally`; el texto no cambia, que es el que se busca.
  - `Error fetching RNC…` se escribía con `console.error` en una petición que
    devolvió **201**. Es un caso previsto que `EcfValidator` ya resuelve, pero
    `instrumentation.ts` manda todo `console.error` a **Sentry** (lote 153), así
    que abría un incidente por algo tolerado. Pasa a `Logger.warn`, y **solo con
    el mensaje**: la petición lleva la clave de API en una cabecera.
  **Regla que deja**: antes de bajar el nivel de un log, comprobar que quien
  llama ya decide — si no, se convierte un fallo serio en algo que nadie ve. Las
  tres guardas de eso son precondiciones del banco.
- **Lote 184: la plantilla aprobada tiene SEIS huecos, no cinco.** Meta aprobó
  `aviso_administrativo` (es_MX) el 2026-09-23, y al leerla **con la API** salió
  que no es la que se escribió en el 179: `empresa` es un hueco **propio**. Con
  cinco parámetros Meta rechaza el mensaje entero (**132000**) y, como nada
  lanza, **no habría salido ni un aviso** — el mismo defecto que el 179 vino a
  cerrar, reaparecido por el mismo motivo: dar por sabida la forma de la
  plantilla. Comprobado con un **envío real** de seis parámetros
  (`message_status: accepted`). `administrador` pasa a un saludo genérico: el
  destino se configura por empresa, no por persona. **Regla**: la forma de la
  plantilla se LEE de
  `GET /meta/whatsapp/v24.0/{waba}/message_templates`, nunca se supone.
  **Pendiente del dueño, no es código**: está aprobada como **MARKETING** y para
  un aviso operativo corresponde **UTILITY** — una de marketing depende de que el
  destinatario no la haya bloqueado y de los límites de Meta, así que un aviso de
  caja descuadrada podría no entregarse. Se arregla recreándola como UTILITY.
- **Lo que se midió sobre la impresión, y lo que NO se hizo por ello
  (2026-09-23).** Con el CLI de Vercel, tras desplegar: `[tiempos-pdf] render`
  sale tres veces y las tres con **`navegador: 'arrancado'`** y
  **`total_ms` 3.134–3.316**. O sea: **el coste dominante de imprimir es el
  arranque en frío de Chromium**, no los datos — el lote 182 quitó ~0,5 s de
  consultas; esto son ~3,2 s por PDF. `motor: 'local'`, `externo_ms: 0`
  (confirmado que `PDF_SERVICE_URL` no está en Vercel) e `imagenes_ms: 1` (el
  lote 105 hizo su trabajo). **Queda cerrada la pregunta que este documento
  arrastraba desde el lote 105**: la respuesta es un Gotenberg permanentemente
  caliente (`PDF_SERVICE_URL` + `PDF_GENERATOR_MODE=external`), y es
  infraestructura, no código.
  **Se propuso un lote para no regenerar el PDF del correo y se DESCARTÓ al
  medir**: esa regeneración es necesaria. El PDF subido al emitir lleva
  "Pendiente de confirmación de la DGII" (regla del lote 180) y el que se manda
  al cliente tiene que llevar "Firma Digital Válida", así que saltársela le
  enviaría al cliente un comprobante rotulado como pendiente. Dos arranques de
  Chromium por factura son, hoy, correctos.
- **Lote 183: el PDF temporal deja de vivir en el disco de la instancia.**
  Reportado por el dueño: al registrar un recibo de cobro, la pantalla de
  impresión da error. En los logs de PRODUCCIÓN (CLI de Vercel):
  `201 POST /ar/receipts` → `200 POST /ar/receipts/{id}/print` →
  **`404 GET /documents/{uuid}/download`**. **404 y no 403**, así que la firma era
  válida: el fichero no estaba. **Dos causas**: (1) se escribía en el disco
  **local** de la instancia y la descarga es otra petición que Vercel enruta por
  su cuenta — intermitente, que es lo peor; (2) se **borraba un segundo después
  de la primera descarga**, y los visores de PDF piden el documento dos veces (la
  segunda con `Range`). **No era solo el recibo: OCHO rutas** usan
  `saveTemporaryFile`. La cura cambia **un solo módulo** (el PDF va a un bucket;
  `StorageService` ya sabía subir/bajar/borrar, se le añadió `listFiles`) y
  **deja de borrar al descargar**: al guardar uno nuevo se barren los de más de
  una hora, sin depender del cron de `reportQueue`, que necesita Redis.
  **Trampa de medición que conviene recordar**: el ruido de Redis marcaba como
  `level: error` peticiones que devolvieron **200** — el estado de verdad está en
  `responseStatusCode`, no en el nivel de la línea. Sin filtrarlo, esto apuntaba
  al sitio equivocado.
  **Un mutante obligó a apretar el banco**: quitar la guarda de recorrido
  (`..` en el identificador) **sobrevivía**, porque un id rechazado y uno que no
  existe devuelven los dos `null`. El doble del almacén apunta ahora **cada ruta
  pedida** y se exige que con un id malo **no se pida nada**.
- **REDIS_URL retirada de Vercel — 2026-09-22, decisión del dueño.** Salió al
  leer los logs de producción con el CLI recién instalado:
  `Redis Connection Error: ERR max requests limit exceeded. Limit: 500000,
  Usage: 500006`. **La cuota de Upstash estaba agotada**, así que la cola llevaba
  quién sabe cuánto sin funcionar — y encima se autoalimentaba: `redis.ts:17`
  tiene `retryStrategy: () => 5000`, o sea **un reintento cada 5 segundos
  indefinidamente**, cada uno contando contra la cuota agotada y cada error
  llegando a Sentry por el interceptor de `console.error`.
  **Medido en el momento**: ninguna factura atascada (`submitted`/`signed`: cero),
  3 emitidas en 24 h todas con veredicto, 1 correo enviado. **No se perdió nada**:
  con ese volumen, la consulta manual y el cron iban resolviendo.
  **Qué se pierde y qué no**: todo está guardado (`worker.ts:12`,
  `reportQueue.ts:24`, `setupRecurringJobs`), así que la aplicación arranca sin
  Redis y `addJob` cae en `triggerFallback`. Eso significa que **la escalera del
  veredicto (lote 102) NO se ejecuta** — un `setTimeout` dentro de una función
  serverless no sobrevive a la respuesta — y el veredicto llega por consulta
  manual o por el cron de GitHub (mediana 204 min). **Ya era así antes de
  retirarla.** El barrido de PDFs temporales tampoco corre; en Vercel es
  inofensivo porque el disco es efímero.
  **Ojo**: quitarla de Vercel **no revoca la credencial** (lo avisa el CLI); el
  valor sigue vivo en Upstash y de ahí se recupera si algún día se sube el plan.
  Y **no surte efecto hasta el próximo despliegue**, porque Vercel inyecta las
  variables al construir.
  **Si algún día se quiere la cola de verdad**: no basta con `REDIS_URL`. El
  worker arranca dentro de cada instancia (`instrumentation.ts:98`) y una
  instancia serverless no vive entre peticiones, así que **está sin medir si esa
  cola llegó a procesar trabajos con retraso alguna vez**. Los veredictos rápidos
  medidos (grupo de 4–7 s, que coincide con los peldaños acumulados de la
  escalera) sugieren que sí, pero no se comprobó.
- **Lote 182: imprimir deja de esperar nueve veces a la base.** El dueño dijo que
  imprimir "dura mucho, cargando los datos". Medido el 2026-09-22 contra
  PRODUCCIÓN: la ruta hacía **nueve consultas en fila**, `1.073 ms` en total
  (ninguna pasa de 140 ms — es **ida y vuelta**, no trabajo de la base). Las ocho
  independientes en paralelo, **con el pool que tiene producción (`max: 2`)**:
  **489 ms**. Ahora van en **dos viajes**: las siete que solo necesitan
  `companyId` (que ya viene de la sesión) o `invoiceId`, y luego las dos que
  necesitan la fila de la factura (la secuencia por su `ecfType`, el cliente por
  su `customerId`). Se conservan el **orden de los errores**, el acotado por
  empresa **y modo**, el de la secuencia por **modo y tipo** (de ahí sale la
  caducidad del NCF impreso) y el cliente `null` en vez de `undefined`.
  **Lo que NO se tocó**, medido: el **arranque en frío de Chromium, 1.234 ms** —
  solo en instancia nueva, dentro de una caliente el navegador se reutiliza — y
  subir `DATABASE_POOL_MAX` a 5 daría otros ~290 ms (decisión de
  infraestructura). **`PDF_SERVICE_URL` NO está en Vercel** (confirmado por el
  dueño): era el sospechoso número uno, porque si estuviera **cada PDF
  intentaría primero un servicio externo con plazo de 15 s**. En el `.env` local
  sí está, apuntando a la propia aplicación, así que **en desarrollo cada
  impresión paga un intento fallido**.
  **La contraprueba cazó la trampa de la sección 3 otra vez**:
  `iFactura > codigo.indexOf('await Promise.all([')` es verdadera **de balde**
  cuando el mecanismo no existe, porque `indexOf` vale −1. Dos guardas previas
  pasaron a precondición.
  **El CLI de Vercel quedó instalado** (59.25.4) a petición del dueño;
  `vercel whoami` no responde hasta que alguien haga `vercel login`.
- **Lote 181: la aceptación de la DGII no se anuncia.** Decisión del dueño
  (2026-09-22), y tiene razón: desde el 180 el papel sale en el clic, así que un
  aviso verde cinco segundos después no dice nada que no se sepa — y un sistema
  que celebra lo normal acostumbra a ignorar sus avisos. Se queda la **recarga
  del listado** (único sitio donde consta el estado nuevo) y el **aviso de
  rechazo**, con más motivo que antes. Se va el botón "Reimprimir con la firma":
  sin aviso no hay dónde ofrecerlo, y se reimprime desde el listado.
  **Un mutante sobrevivió y obligó a apretar dos bancos**: la comprobación de que
  al aceptar se recarga el listado usaba
  `/if \(...'accepted'\) \{[\s\S]*?loadInvoices\(\);/`, y ese `[\s\S]*?`
  **se cuela en la rama del rechazo y encuentra SU `loadInvoices()`** — quitar la
  recarga del aceptado no hacía fallar nada. Ahora el trozo se **acota** entre el
  `if` de aceptado y el `} else if` del rechazo. **Regla general: un
  `[\s\S]*?` entre dos ramas hermanas no comprueba la rama que crees.**
- **Lote 180: la factura se imprime en el acto, con su timbre.** Había **dos
  creencias contrarias** en el código y las dos eran falsas a medias (medido el
  2026-09-22 contra PRODUCCIÓN):
  - `invoices/page.tsx` no imprimía hasta `accepted`, y su comentario decía que
    el código de seguridad, la fecha de firma y el QR "los produce la DGII al
    firmar y todavía no existen". **Falso: los produce mSELLER.** Las 12
    respuestas de envío más recientes traen
    `rnc, ecf, internalTrackId, securityCode, qr_url, signedDate`, y
    `invoiceDbBooker` las guarda en la factura en la misma transacción.
  - `documentTemplates` colgaba el QR de `accepted` porque un RECHAZADO trae esos
    mismos datos. **Cierto**: E440000000001, E440000000002 (rechazados) y
    E340000000002 (baja) recibieron una respuesta con **la misma forma** que una
    exitosa; el motivo llegó después. La respuesta del envío significa "mSeller
    lo firmó y lo transmitió", no "la DGII lo aceptó".
  **Lo que resuelve las dos: el QR es el TIMBRE**, un dato del documento, no un
  certificado de aprobación. Lo que no puede afirmarse sin veredicto es la
  **leyenda** — el incidente del lote anterior no fue el QR, fue que dos
  rechazados salieron rotulados "Firma Digital Válida". Timbre y leyenda se
  deciden **por separado** en `services/invoice/timbreDelComprobante.ts` (puro).
  **Decisión del dueño (2026-09-22): se imprime inmediatamente salvo que el envío
  haya fallado.** Del envío al veredicto la **mediana es 20 s** (4% a los 2 s,
  15% a los 5 s, 84% al minuto): esperar 2 segundos —la primera idea— habría
  cubierto el 4% cobrándoselos a todas las ventas.
  Se imprime **dentro del clic**, sin `setTimeout`, que es cuando el navegador no
  bloquea la ventana; **sin timbre no se imprime** y se dice por qué (eso era lo
  que hacía salir el comprobante provisional, no la falta de veredicto); un
  rechazado o una baja no se imprimen solos; la consulta de cortesía de los 5 s
  **ya no imprime** (serían dos papeles del mismo comprobante) y ofrece
  "Reimprimir con la firma"; y si la DGII rechaza **después** de imprimir, el
  aviso dice que ese papel no vale.
  **Cuatro bancos y una prueba se pusieron en rojo y ninguno señalaba una
  regresión**: los cinco anclaban la FORMA de la regla vieja
  (`firmaComprobante.vitest.ts`, `verificar_impresion_estado.ts`,
  `verificar_mseller.ts`, `verificar_impresion_tras_veredicto.ts`,
  `verificar_imprimir_solo.ts`, `verificar_sync_ecf.ts`). Reescritos sobre la
  PROPIEDAD, conservando el comentario del incidente. **Es la lección del lote
  100 otra vez: cambiar una regla compartida obliga a correr TODOS los bancos.**
  **Para el dueño**: si un comprobante se imprime y la DGII lo rechaza después,
  ese papel no vale y hay que recuperarlo. Medido: 4 rechazados de 75.
- **Lote 179: el aviso encaja en la plantilla aprobada.** El 178 mandaba el
  aviso como **un** parámetro suelto (no había plantilla cuando se escribió). La
  que creó el dueño el 2026-09-21 en el panel de Kapso, `aviso_administrativo`
  (**es_MX**), tiene **cinco huecos y con nombre**: `administrador`,
  `tipo_aviso`, `cantidad`, `fecha`, `app_name`. Meta rechaza el mensaje
  **entero** si el número de parámetros no coincide (132000), así que **en
  cuanto se pusiera `KAPSO_PLANTILLA_AVISO` no habría salido ni un aviso**, y
  como nada lanza solo se habría visto en el registro.
  `services/avisos/plantillaDeAviso.ts` (puro) rellena los cinco: la **empresa**
  en el saludo (el destino es por empresa y quien administra varias las recibe
  todas en el mismo teléfono), título + descripción sin el punto final que ya
  pone la plantilla, el **importe leído del texto** del aviso — o "No aplica",
  porque inventarle un cero a un 606 que vence se lee como una cantidad — y el
  **día de RD**, no el del servidor (el defecto del 174 otra vez: en UTC, a
  partir de las 20:00 de RD ya es mañana). **Reglas de Meta para un parámetro de
  cuerpo**: ni vacío, ni salto de línea, ni tabulador, ni cuatro espacios
  seguidos, y con tope; el texto de un aviso está escrito para una pantalla, así
  que pasa por `limpiarParametro`.
  **Lo que no se puede comprobar desde aquí, y hay que saberlo**: que la
  plantilla exista en la cuenta de Meta. El 2026-09-21
  `GET /meta/whatsapp/v24.0/1111045594943789/message_templates` devolvía
  `{"data":[]}` — creada en el panel de Kapso, aún no en la cuenta del número
  (hay además una configuración de **sandbox**, `2102230076919824`, que ni
  admite ese endpoint). Hasta que aparezca, poner `KAPSO_PLANTILLA_AVISO` hace
  que Meta responda **132001** y no salga ningún aviso. Por eso el idioma por
  defecto es `es_MX`: uno que no case da el mismo 132001 en silencio.
  **De paso**: `tsc -p scratch` cazó las cinco llamadas del banco del 178 a
  `avisosQueSeMandan`, que ganó un argumento. El banco no sustituye al
  compilador (lección del 103, otra vez).
- **Lote 178: los avisos del panel salen por WhatsApp.** Existen desde el 158 y
  se guardan desde el 160, pero solo los ve quien ENTRA al panel; un cheque que
  se cobra mañana no espera a eso. **El destino es de la EMPRESA** (campo en
  Configuración; vacío = no se manda nada, que es como quedan las seis), y solo
  van los **graves y los de advertencia** — las dos, decisión del dueño. **Cada
  aviso se manda una vez**: el panel recalcula sus avisos en cada carga, así que
  la marca `notifications.whatsapp_enviado_at` es lo que impide que el mismo
  cheque se anuncie cada vez que alguien abre el inicio; se borra si el aviso se
  cierra y vuelve a aparecer. **Nunca lanza** (plazo 8 s; el panel se carga
  igual), **marca lo que SALIÓ, no lo que se intentó** (un fallo de red se
  reintenta en la siguiente carga en vez de perderse para siempre), y sin número
  configurado **no consulta nada**. **MIGRACIÓN
  `drizzle/0013_avisos_por_whatsapp.sql`: aplicarla ANTES de desplegar.**
  **Variables en Vercel**: `KAPSO_API_KEY` y `KAPSO_PHONE_NUMBER_ID`
  (1405968992591205); sin ellas no manda y lo dice en el registro, no falla.
  **Kapso tiene DOS direcciones** y eso costó cuatro 404: administración en
  `api.kapso.ai/platform/v1/...` y **envío** en
  `api.kapso.ai/meta/whatsapp/v24.0/{phone_number_id}/messages`, con el cuerpo
  de la Cloud API de Meta. **La ventana de 24 horas de Meta**: texto libre solo
  dentro de las 24 h desde que el usuario escribió a la empresa; fuera de eso
  hace falta **plantilla aprobada**. Hoy no hay ninguna, así que **hasta que se
  apruebe una y se ponga `KAPSO_PLANTILLA_AVISO`, los avisos solo llegan a quien
  haya escrito al número en las últimas 24 horas**. Verificado el 2026-09-21: el
  número de LATIN DOORS está CONNECTED, en producción, y un mensaje de prueba
  llegó. **El parámetro sordo del lote 135 volvió a aparecer, dentro de este
  mismo lote**: el campo estaba en el esquema de validación y en el GET, la
  pantalla lo mandaba en el cuerpo, y el PATCH no lo escribía en la columna —
  nada falla, el número se pierde al guardar y los avisos no llegan nunca. Se
  cazó revisando el diff antes de commitear, no por el banco; ahora hay tres
  comprobaciones que lo vigilan. **Al añadir un ajuste a esa ruta, comprobar
  siempre que llega a `settingsUpdate`**: el esquema de Zod lo acepta igual.
  **Y una trampa nueva: lo que DECIDE no puede arrastrar `@/db`.**
  `avisoPorWhatsApp.ts` importaba de `sincronizarAvisos.ts`, que abre la
  conexión al cargarse, así que el módulo cuyo valor es probarse sin red ni base
  no se podía cargar sin `DATABASE_URL` — y eso **no se vio al escribirlo, se
  vio corriendo `verificar.ps1` entero**, que es donde no hay `.env`. La forma
  del aviso y su severidad bajan a `src/services/avisos/avisoDelPanel.ts`, sin
  `@/db`, y `sincronizarAvisos` las reexporta. De paso,
  `verificar_diferencia_de_arqueo.ts` (176) anclaba el **fichero** donde vivía
  la severidad y no la regla: la séptima repetición de la trampa de la sección 7.
- **Lote 177: recuperar la contraseña.** No existía: quien la olvidaba tenía que
  pedir que se la cambiaran en la base. Y sin embargo `password_resets` estaba
  en el esquema **desde el principio** y con la forma correcta (`token_hash`,
  `expires_at`, `used_at`), con **cero referencias** en `src/` y 0 filas en
  PRODUCCIÓN — mismo caso que `notifications` antes del 160, y por eso **no
  lleva migración**.
  **Decisión del dueño (2026-09-21)**: **administración y sistemas** se
  recuperan solos por correo; **al resto le cambia la contraseña un
  administrador** desde Usuarios. El motivo es de control: en una empresa
  pequeña el correo de un cajero está tan a mano como su puesto.
  Seguridad: la respuesta es **la misma siempre** (exista o no la cuenta, sea o
  no administración, salga o falle el SMTP) — si cambiara, el formulario diría
  quién tiene cuenta y además **quién es administrador**; el token se guarda
  **hasheado** (SHA-256, no bcrypt: son 32 bytes al azar, lo que protege es la
  entropía); **caduca en 1 h y se usa una vez**, y pedir uno nuevo invalida el
  anterior; y **al cambiarla se cierran las sesiones**, en la misma transacción
  que gasta el enlace.
  **Lo que ya existía y le faltaba una cosa**: `PUT /api/v1/admin/users/[id]` ya
  aceptaba `passwordRaw`, pero **no cerraba las sesiones** del usuario — se le
  cambiaba la clave y quien tuviera su sesión abierta seguía dentro. Ahora sí, y
  queda registrado (`password_reset_admin`).
  Banco de 52 comprobaciones con la parte que protege **ejecutada** (200 tokens
  generados). Contraprueba 52/52. **Cuatro mutantes, cuatro muertos, y uno
  obligó a apretar el banco**: `if (false)` en la guarda que cierra las sesiones
  dejaba todo el código intacto y las comprobaciones lo daban por bueno —
  miraban que existiera, no que se ejecutara.
  **Para que funcione en producción hace falta `APP_URL`** (para armar el
  enlace); sin ella no se manda nada, queda registrado y la respuesta no cambia.
- **Lote 176: una caja que no cuadró deja de pasar desapercibida.** Pregunta del
  dueño: *¿el cierre de caja hace asiento, o lo hace el contador a mano?*
  Medido: **no hace ninguno**, y para un arqueo que cuadra está bien —la caja ya
  se asienta operación por operación—. Pero si **no** cuadra, la diferencia se
  quedaba solo en el resumen de la sesión: el mayor seguía contando un dinero
  que no está en la caja y nada lo decía.
  Se propuso asentarla sola contra una cuenta por cobrar al cajero. **El dueño
  dijo que no** (2026-09-21): a qué cuenta va un faltante es contable y cambia
  según el caso. Lo que sí se hace es que **no se olvide** — un aviso del panel
  que se queda hasta que alguien lo resuelve, con severidad **error** (un
  descuadre no es un recordatorio) y clave estable, así que se cierra solo
  (lote 160). La comparación va en **centavos**: 0,004 no es dinero que falte.
  **Para que el aviso pudiera apagarse hubo que enchufar algo desconectado**: la
  ruta `/approve` existía y **nadie la llamaba** —`approved_by` está vacío en
  todas las sesiones—. Un aviso que no se puede resolver acaba siendo ruido.
  Botón en el historial de caja con la MISMA regla que el panel, `listSessions`
  devuelve `approved_at` (sin eso el botón no desaparecería nunca), y
  **`approveSession` no llevaba `modo`**: aprobar desde PRODUCCIÓN podía apagar
  la diferencia de una sesión de PRÁCTICAS, y al revés, que es peor.
  El banco lleva una sección *"lo que NO hace, a propósito"*: que cerrar una
  caja siga sin asentar. Si alguien lo "mejora", tendrá que decidirlo.
  **De paso**: `verificar_avisos_cheques_caja.ts` (158) comprobaba que
  `vencimientos.ts` no contuviera la palabra `'closed'` como proxy de "no cierra
  sesiones". Este lote compara `status !== 'closed'` y la rompió sin que faltara
  nada; ahora ancla la propiedad (el módulo de avisos es puro, no conoce la
  base).
- **Lote 175: las cuentas puente, en bloques.** Desde el lote 171 la pantalla
  enseña las **dieciséis** en el orden del catálogo (1.1.01.01, 1.1.01.02,
  1.1.02.01…), que para quien las configura no es un orden. Ahora van en cinco
  tarjetas —caja/bancos/tarjetas, clientes y ventas, inventario y costo,
  compras y proveedores, impuestos y retenciones— con una línea que dice qué
  alimenta cada una. La **categoría es campo obligatorio** de
  `CUENTAS_DEL_SISTEMA` y los bloques se derivan de ella: una clave nueva no
  puede quedarse sin sitio, porque el compilador la reclama. El reparto es
  **total** (toda cuenta en exactamente un bloque), la misma propiedad que
  `purchases/pasos.ts`, y por el mismo motivo: si una no cayera, desaparecería
  de la pantalla — que es el defecto del lote 171.
  **No hay bloque de recursos humanos, y no es un olvido**: el dueño lo pidió y
  al ir a hacerlo salió que **la nómina NO ASIENTA** — `api/v1/hr/` no menciona
  ni asientos ni cuentas contables. Sueldos, TSS e ISR retenido a empleados se
  calculan y se pagan pero **no entran al libro mayor**. Queda como frente
  aparte, con decisiones contables del dueño; el banco lleva dos comprobaciones
  que **caerán el día que la nómina asiente**, que es cuando hay que mirarlo.
  **De paso**: el trinquete del 171 ("ningún código de cuenta escrito en la
  pantalla") se cazó a sí mismo — su marca anclaba `PUENTES_DE_CUENTAS.map(`.
- **Lote 174: "Ventas de hoy" se vaciaba a las 8 de la noche.**
  `biRepository.getGeneralStats` calculaba el día con
  `new Date().toISOString().split('T')[0]` —el día **UTC**— y Vercel corre en
  UTC. RD es UTC−4 todo el año: **a partir de las 20:00 hora de RD el día UTC ya
  es el siguiente**, así que el panel perdía la jornada entera y solo contaba lo
  vendido después de esa hora. Misma trampa del lote 158, en otro sitio.
  **Salió por casualidad**: la verificación del lote 173 se corrió a las 20:22 y
  `verificar_bi.ts` se puso en rojo. A cualquier otra hora habría pasado.
  `diaRD`/`diaRDMas` suben de `services/avisos/vencimientos.ts` a
  `utils/fechasLocales.ts` (con `primerDiaDelMesRD`/`primerDiaDelAnoRD`), y el
  SQL convierte la columna:
  `((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Santo_Domingo')::date`.
  El primer `AT TIME ZONE` **no sobra**: sin él Postgres interpreta el
  `timestamp sin zona` en la zona de la SESIÓN y el panel daría cifras distintas
  según quién lo abra (hay una comprobación que lo ejerce en Asia/Tokyo).
  **El entorno de pruebas no se parecía a producción**: Supabase corre en UTC y
  el cluster desechable heredaba la zona de Windows (America/La_Paz, UTC−4), así
  que guardaba hora local. `base_desechable.ps1` lo crea con `timezone=UTC`.
  **`verificar_bi.ts` no basta como guarda**: sus facturas usan `now()`, así que
  las dos lógicas coinciden casi siempre. `verificar_dia_de_rd.ts` fija el
  `created_at` a las 23:30 de RD —donde discrepan— y lo comprueba con una
  precondición que se niega si la factura no quedó guardada en el día UTC
  siguiente. Contraprueba 9/9, tres mutantes muertos.
- **Lote 172: cerrar la caja deja de ser una formalidad.** Medido el 2026-09-20:
  las **tres** sesiones cerradas de Latin Doors cuadran **al centavo** y ninguna
  lleva justificación (34 y 44 días abiertas; 1.200.825,01 y 2.204.992,49). Los
  importes llevan céntimos y los billetes son enteros: el único campo con
  decimales era **"Total Monedas"**, libre y sin tope. Se escribió ahí el
  esperado, con 85.000,00 reales en la caja. Y el esperado ya venía inflado: de
  esos 2.204.992,49, **2.200.052,48 son cobros marcados como efectivo** —uno de
  602.000,00, otro de 550.000,00, dos de 400.000,00—, transferencias anotadas
  como efectivo porque hasta el lote 151 el cobro no podía decir por qué banco
  entró (18 cobros, 3.257.815,89).
  Ahora: **las monedas se desglosan** y desaparece el campo libre; **el total lo
  calcula el servidor** desde el desglose (la ruta ya no acepta `actualBalance`);
  **el desglose se guarda** (antes no se guardaba en ningún sitio, así que un
  cierre no dejaba nada que auditar); y el **arqueo es CIEGO** (decisión del
  dueño): `/cash/sessions/active` no devuelve el esperado con la sesión abierta
  —va en el servidor, ocultarlo solo en la pantalla lo deja en la respuesta de
  red— y el resultado sale al cerrar.
  **Consecuencia deliberada**: el cierre **ya no se niega por una diferencia**.
  El freno viejo decía el importe en su mensaje de error, así que bastaba volver
  atrás y ajustar el conteo. La diferencia se registra y la sesión queda
  pendiente de aprobación (`approved_by`; la ruta `/approve` ya existe).
  **Lo que no es efectivo consta sin cuadrar la caja** (pedido del dueño): el
  cierre recoge los cobros no-efectivo de la ventana de la sesión con su
  **constancia** y los guarda en el resumen; una transferencia o cheque **exige**
  su número; y una venta que no es en efectivo ya no puede tocar la caja aunque
  le manden `cashSessionId` (ninguna de las 61 a crédito lo ha hecho: cierra el
  hueco antes de que se pise).
  **MIGRACIÓN `drizzle/0012_arqueo_de_caja.sql`: aplicarla ANTES de desplegar.**
  **Honestidad sobre el alcance**: el cajero sigue viendo sus movimientos y
  sumarlos da el esperado; lo que se retira es la suma ya hecha al lado del
  formulario, que era la que invitaba a copiar.
  **Para el contador**: las tres sesiones cerradas y sus cobros no se tocan.
  Repartir aquellos 3.257.815,89 entre efectivo y transferencia es suyo, y sin
  la constancia de cada uno no hay con qué hacerlo.
  Banco `verificar_arqueo_de_caja.ts` (40), contraprueba 40/40, seis mutantes
  muertos. Dos apretaron el banco: la resta ingenua sobrevivía porque lo contado
  es entero y hacía falta un esperado con céntimos (100 − 99,9 =
  0,09999999999999432), y la constancia se comprobaba **leyendo el texto** del
  mensaje, así que `if (false && …)` la dejaba intacta — ahora se ejecuta.
- **Lote 171: nada de contabilidad escrito en el código.** Regla del dueño
  (2026-09-19): el plan de cuentas es del contador, así que **el catálogo se
  crea al crear la empresa**, **el enlace se elige en Configuración > Cuentas
  Puente**, y **ningún código de cuenta va fijado en el código**. El lote 170
  dejó la cuenta de la tarjeta fuera de las tres.
  Al mirarlo salió el hueco de verdad: `CUENTAS_DEL_SISTEMA` tenía 16 claves y
  la pantalla de Cuentas Puente traía **nueve, escritas a mano**. Las otras
  siete (retenciones de clientes, anticipos de ISR, ITBIS e ISR retenidos por
  pagar, otros impuestos de compras) las resolvía el código con un código por
  defecto y **el contador no tenía dónde cambiarlas**.
  Ahora: `credit_card_payable` → 2.1.01.03 entra en la tabla **y en el
  sembrador** (toda empresa nueva nace con ella; las existentes la reciben con
  `completarCuentasDelSistema` del lote 165, que **deriva el nivel del código**
  — no hace falta un guion de datos por empresa), y la pantalla se **deriva**
  de la tabla (`PUENTES_DE_CUENTAS`): una fila por CUENTA y no por clave
  (`itbis_purchases` y `purchase_itbis_paid` son la misma cuenta, y en dos
  filas se podrían apuntar a sitios distintos), solo cuentas del tipo esperado
  pero **sin esconder nunca la ya elegida** (si no, guardar borraría el enlace
  sin pedirlo). La compra deja de fijar cuentas: la de costo sale del puente
  `cost_of_goods_sold` (había **dos** copias buscándola por prefijo de código o
  por nombre) y con tarjeta se **propone** la configurada.
  Banco `verificar_cuentas_puente.ts` con **trinquete**: ningún código de
  cuenta escrito en las pantallas de compras y ajustes. Contraprueba 29/29;
  seis mutantes, cinco muertos y uno equivalente **anotado en el código**
  (agrupar por etiqueta en vez de por código da hoy lo mismo). Uno de los
  mutantes cazó una trampa de mera presencia en el propio banco.
  **Error mío, corregido**: el 19/09 creé 2.1.01.03 en Latin Doors con
  `level = 3` a mano; sus hermanas son nivel 4 y el convenio es
  `codigo.split('.').length`. Sin efecto contable (los estados financieros
  acumulan por `parent_id` y el catálogo impreso recalcula el nivel), pero es
  dato incorrecto. Arreglado el 2026-09-20 con
  `scratch/_to_delete/corregir_nivel_tarjeta.ts`, que **no lleva el nivel a
  mano**: lo compara con el de su hermana 2.1.01.01.
  **DATOS — hecho el 2026-09-20**: `completar_cuentas_empresas.ts --aplicar`
  (el guion del lote 165, no uno nuevo) creó 2.1.01.03 bajo 2.1.01 y enlazó
  `credit_card_payable` en las otras cinco empresas. Comprobado: **las seis con
  la cuenta, nivel 4 y la clave enlazada**, sin mover un saldo (652 renglones
  de asiento intactos). Latin Doors sigue en 1.1.08, 2.1.04 y 2.1.05.
  **Ojo con `AccountingRepository.getMappings`**: enlaza **sola** las claves que
  falten cuando la cuenta ya existe con ese código (el enlace de Latin Doors
  apareció así, al abrirse Contabilidad). Explica enlaces que salen "solos";
  es benigno porque se niega a enganchar las claves de `CODIGOS_ANTIGUOS`, pero
  **no crea cuentas**: por eso las cinco necesitaban el guion.
- **La deuda de la tarjeta de crédito — 2026-09-19, tras medir el lote 170.**
  El mensaje del lote 170 decía "las 6 compras con tarjeta siguen acreditando
  1.1.01": **estaba mal planteado**. Medido en producción: **1.1.01 está en
  CERO**; esos 49.644,03 ya los había absorbido la conciliación del mismo día.
  Lo que sí faltaba era el **pasivo**: confirmado por el dueño, las seis son de
  tarjeta de **crédito** y la deuda sigue pendiente, así que ese dinero nunca
  salió. Como los saldos reales de caja, Banreservas y Scotiabank están fijados
  contra conteo y estados de cuenta, el efectivo "de más" no existe: la salida
  sin registrar era **110.149,35**, no 60.505,32.
  `scratch/_to_delete/deuda_tarjeta_credito.ts` (ensayo previo, lanzado por el
  dueño) crea **2.1.01.03 Tarjetas de Crédito por Pagar** —que **no existía en
  ninguna de las seis empresas**, y sin ella el selector del lote 170 solo
  puede ofrecer bancos— y asienta `debe 6.1.02.06 / haber 2.1.01.03` por
  49.644,03, **fechado el 19/09**. Comprobado después: 2.1.01.03 acreedora por
  49.644,03, Gastos Diversos 110.149,35, 1.1.01 intacta en cero, el libro
  cuadra (20.551.757,95).
  **No se reabre julio** (3 de las 6 son de un período cerrado) y **el 606 no
  cambia**: la forma de pago 03 es "tarjeta", que era lo correcto. Las compras
  originales no se tocan y su costo sigue deducible con su NCF; el cargo a
  Gastos Diversos **no es deducible** (sin comprobante).
  **Queda abierto para el contador**: conciliar 2.1.01.03 contra el estado de
  cuenta de la tarjeta. Se asentó por LIBROS porque es lo único justificable
  comprobante a comprobante; el saldo real traerá intereses, otros consumos y
  abonos, y esa diferencia es decisión suya (mismo ejercicio que Scotiabank).
  **Lo que NO era un problema, y se midió de paso**: además de esas 6, otras
  **64 compras en efectivo (605.344,90) también acreditaron 1.1.01**, la cuenta
  de agrupación. Hoy la clave `cash` de las seis empresas apunta a **1.1.01.01
  Caja General** y desde el lote 136 no se asienta en agrupación: no se repite.
- **Más correcciones de datos del 2026-09-19** (mismo método): caja (85.000,00)
  y Banreservas (326.695,13) conciliados al 19/09 desde 1.1.01
  (`conciliar_caja_banreservas.ts`); los 60.405,32 que quedaron en 1.1.01
  "salieron sin registrarse" → 6.1.02.06 Gastos Diversos, **no deducible**
  (`cerrar_1_1_01.ts`): **1.1.01 queda en cero**; y 2.1.03, 2.1.04, 2.1.05 del
  catálogo de Latin Doors, acreedoras, nivel 3, hijas de 2.1
  (`corregir_cuentas_2_1.ts`).
- **Lote 164: los totales del balance general y del estado de resultados**
  (`services/accounting/estadosFinancieros.ts`). Sumaban solo las cuentas de
  NIVEL 1 y la balanza da cada cuenta con lo suyo: Latin Doors 2026 veía
  "Total ingresos 0,00" con 3.521.728,32 asentados. Ahora: cada cuenta con el
  signo de su TIPO (no de su naturaleza), cada grupo suma sus hijas, el estado
  de resultados es el movimiento del rango y el balance lleva el resultado
  acumulado; dice la diferencia si no cuadra. Latin Doors cuadra al centavo
  (activos 1.211.409,01 = pasivos 944.644,20 + resultado 266.764,81).
  2.1.03 ITBIS por Pagar, 2.1.04 ISR Retenido y 2.1.05 ITBIS Retenido estaban
  como DEUDORAS y nivel 1, sin padre: corregidas en datos el mismo día (ver
  abajo).
- **Correcciones de datos del 2026-09-19, a petición del dueño** (guiones en
  `scratch/_to_delete/`, con ensayo previo y lanzados por él):
  la transferencia de RD$6.923,52 del 06/08 llevada al libro de Banreservas
  (`corregir_transferencia_6923.ts`), y **Scotiabank conciliado al 19/09 con
  el estado de cuenta (459.993,35)** (`conciliar_scotiabank.ts`): asiento de
  reclasificación debe 1.1.01.04 / haber 1.1.01 por 1.957.738,24 (decisión del
  contador; única excepción al "no se asienta en agrupación" del lote 136,
  porque es la que la vacía) y depósito de conciliación de 778.089,61 en el
  módulo. El módulo solo conocía las SALIDAS: hasta el lote 151 los cobros por
  banco no creaban el depósito. Lo que quedaba en 1.1.01 se concilió después
  (caja, Banreservas y la salida no registrada): ver la entrada del lote 166.
- **Lote 163: un pago a suplidor por transferencia o cheque sale del banco**
  (`services/cxp/cuentaDelPago.ts`, el criterio del lote 151 para los
  cobros). Antes se asentaba y el banco no se enteraba: ni su saldo ni su
  libro, y la transferencia ni mandaba la cuenta. Ahora exige el banco, el
  haber del asiento tiene que ser la cuenta contable de ESE banco (también en
  el cheque en garantía, para que su cobro descuente el mismo), y crea el
  retiro pendiente de conciliar. El aviso de efectivo prometía un movimiento de
  caja que no existe: ya no. **Para el contador**: 1 transferencia de Latin
  Doors (RD$6.923,52, 06/08) quedó fuera del libro de banco; no se toca.
- **Lote 162: un cheque en garantía ya no se cobra contra una factura que no
  debe su importe** (`services/cxp/cobroDeGarantia.ts`). Antes el cobro se
  asentaba ENTERO (banco, mayor, estado de cuenta) y el exceso solo se
  devolvía como "descuadre": con el cheque 120 habría salido otra vez de
  Scotiabank. Ahora se mira el saldo bajo bloqueo ANTES de marcar el cheque:
  en lote va a `noAplicados` con su motivo; uno solo, error 409. Qué hacer
  entonces (anular el otro pago, anticipo) es del contador: **no existe
  anulación de pagos** (P3-48), y la corrección del cheque 120 se hizo en datos.
- **Lote 161: al pagar una factura de suplidor se ven sus cheques en garantía
  pendientes** (número, banco, fecha de cobro, monto, total cubierto y saldo
  sin cubrir), el monto propuesto pasa a ser lo sin cubrir y pagar por encima
  pide confirmación (`services/cxp/garantiasDeFactura.ts`,
  `dashboard/ap/components/GarantiasDeLaFactura.tsx`). Un cheque en garantía no
  rebaja el saldo hasta cobrarse: pagar la factura mientras tanto era pagarla
  dos veces. **Pasó el 19/09** con el cheque 120 de EVERLAST DOORS: se
  registró una transferencia estando el cheque pendiente, y el banco lo cobró
  el 17/09. **Corregido en datos a petición del dueño**
  (`scratch/_to_delete/corregir_cheque_120.ts`, con ensayo previo): asiento de
  la transferencia dado de baja (no borrado), su movimiento de suplidor
  anulado, y el cheque cobrado con fecha 17/09 por la función del sistema.
- **Lote 159: el panel avisa del 606 y del 607 del mes cerrado** hasta que
  alguien los marca como presentados (`services/dgii/declaracionesPendientes.ts`,
  tabla `declaraciones_dgii`). **MIGRACIÓN `drizzle/0009_declaraciones_dgii.sql`:
  aplicarla ANTES de desplegar.** El fichero **no se guarda**: se genera al
  descargarlo, así nunca queda viejo. Al medir, el 606 y el 607 de julio y de
  agosto ya habían pasado el plazo (día 15) sin que nada avisara.
- **Lote 158: el panel avisa ANTES.** El cheque en garantía se avisa 3 días
  antes del cobro (antes solo el día del cobro o después: el 123, de
  RD$144.092,15, se cobraba al día siguiente y no avisaba nada), y hay aviso
  nuevo para la caja que no se cerró el mismo día (había una abierta desde el
  06/08, 43 días). `services/avisos/vencimientos.ts`, **con el día de RD
  (UTC−4), no el del servidor**: en UTC, la caja de anoche y la de esta
  madrugada salen al revés. La caja no se cierra sola (JRN-11).
- **Lote 157: los correos quedan registrados** (`system_email_logs` llevaba CERO
  filas con el SMTP puesto hacía 85 días: el registrador exigía empresa y los dos
  correos de factura se encolaban sin ella). Ahora el trabajo de la cola exige
  empresa, modo y contexto; se registra salga o falle; y en el listado de
  facturas el botón del correo dice verde/rojo/gris con la fecha o el motivo
  (`services/correo/registroCorreo.ts`). **Queda pendiente**: `notifications`
  también está vacía, nadie escribe en ella.
- **Lote 156: el QR impreso lo da mSeller.** Si falta, se le pide
  (`services/dgii/qrDelComprobante.ts`, plazo de 6 s) y se guarda en la factura;
  si tampoco lo tiene, el documento sale sin QR. Se retiró `urlConsultaDgii`,
  que armaba `ecf.dgii.gov.do/e-cf/Consulta?...` — esa dirección responde 404.
  Decisión del dueño (2026-09-18): el enlace no se arma en el código.
- **Sentry (lote 153): solo errores.** Servidor (`src/instrumentation.ts`:
  `onRequestError` y el interceptor de `console.error`, que ve los 500 que las
  rutas atrapan), navegador (`instrumentation-client.ts`, `app/global-error.tsx`).
  Sin trazas ni Replay. Todo evento pasa por
  `src/lib/observabilidad/filtroSentry.ts` (sin RNC, cédulas, correos, tokens,
  cabeceras ni cuerpos). Túnel `/monitoring` por la CSP. **Se activa solo con
  variables en Vercel**: `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`,
  `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` (de organización). **ACTIVO desde el
  2026-09-16**: las cuatro variables están en Vercel (proyecto `cfe`; org y
  proyecto de Sentry `contfast`; el token solo en Production), el despliegue de
  `64eae7c` subió los source maps y un error de prueba lanzado desde el navegador
  en producción llegó a Sentry. **pnpm 11 exige edad
  mínima de publicación**: si al instalar añade `minimumReleaseAgeExclude` a
  `pnpm-workspace.yaml`, deshacerlo y elegir una versión anterior.
  **Lote 147: el 607 lleva el NCF modificado de las notas, la fecha en hora de
  RD (UTC−4, no UTC) y el RNC declarado en el comprobante**; sin documento, el
  tipo va vacío en vez de "3".
- **Los movimientos bancarios no llegaban al mayor — cerrado en el lote 137.**
  `registerTransaction` ajusta el saldo y luego asienta, pero el asiento entero
  colgaba de un `if (data.contraAccountId)` con el parámetro opcional en la
  ruta: sin contrapartida, saldo movido y mayor sin enterarse, sin un error.
  Medido: **las 8 transacciones bancarias (RD$3,99 M, seis ya marcadas como
  conciliadas) no tienen asiento ninguno.** Ahora la contrapartida es
  obligatoria en el tipo y en el esquema. De paso se retiró
  `bank/accounts/[id]/transactions`, una ruta gemela **que no llamaba nadie** y
  que contabilizaba todos los bancos contra el código fijo `1.1.01.02` (las
  cuentas reales son 1.1.01.03 y 1.1.01.04; la 02 tiene cero renglones) además
  de crear al vuelo `4.1.99` y `6.1.99`, inexistentes en las seis empresas. Con
  ella se fue la última copia de `getOrCreateAccount`: **la lista PENDIENTES de
  `resolucionCuentas.vitest.ts` queda vacía.** **Para el contador**: los 8
  movimientos ya registrados siguen sin asiento; entrarlos al mayor es decisión
  suya.
- **El libro diario, medido el 2026-09-15 (lote 136): CUADRA.** 199 asientos en
  PRODUCCIÓN y 23 en PRUEBA, todos con debe = haber; 598 renglones, ninguno con
  debe y haber a la vez ni con los dos en cero; sin asientos huérfanos;
  diferencia global 0,00. Lo que sí había era **una segunda puerta al libro sin
  guardia**: `arRepository.registerReceipt` insertaba su asiento a mano, sin la
  validación de `createJournalEntry`, sin autor (los 7 asientos sin `created_by`
  desde que existe la columna eran **todos** recibos de cobro) y contra 1.1.01 y
  1.1.02, que son **cuentas de agrupación** en las seis empresas. Cerrado.
  **Queda para el contador, no es código**: (1) los renglones ya asentados sobre
  1.1.01 (108), 1.1.02 (66), 2.1.01 (20) y 5.1 (2) siguen donde están — otras
  rutas también las usaron, así que el árbol del balance enseña el padre como si
  fuera el total del grupo cuando en realidad es solo lo suyo; (2) un cobro por
  transferencia o cheque debita la misma cuenta que uno en efectivo, porque el
  recibo no guarda contra qué cuenta bancaria entró.
- **El 606 estaba muerto — cerrado en el lote 134.** Tres causas a la vez, y
  ninguna se veía: `companyId=TODO_COMPANY_ID` (403 siempre, tabla vacía con
  48 gastos en julio y 33 en agosto en la base), el botón de exportar apuntando
  a `/api/v1/reports/606/txt`, que no existe (es `download/`; el que tiene
  `txt/` es el 607), y el mes cerrado el día 31 contra una columna `date`, que
  **revienta la consulta entera** en los meses de 30 días y en febrero. Lo
  encontró `scratch/_to_delete/medir_parametros_sordos.ts`, que cruza lo que
  manda cada llamada con lo que lee su ruta. **Queda para el contador**: si
  algún 606 se remitió con el TXT roto, el lote no lo arregla hacia atrás.
- **`limit` contra `per_page` — barrido cerrado en el lote 135, con trinquete.**
  El lote 110 lo cerró en cotizaciones; el **132** lo encontró otra vez, peor,
  en códigos de barras (`?limit=100000` devolvía 20 filas, y de ahí salían las
  tres tarjetas **y** la lista de "TODOS los productos faltantes" del botón de
  autogenerar: 18 de 57); el **134** acabó en el 606; el **135** barrió el
  resto. **La forma del defecto es que un parámetro que nadie lee no falla:
  devuelve la primera página en silencio**, y si eso alimenta un desplegable,
  la opción que falta no deja hueco donde mirar. Lo peor que salió: el filtro
  de productos de movimientos de inventario estaba **vacío del todo** (leía
  `data.items`, que no existe), y la compra por reorden buscaba el producto
  dentro de una página de 20 de 87, abriéndose vacía y callada para los otros
  67. **Ya no hay que acordarse**: `scratch/verificar_listas_completas.ts`
  ejecuta el barrido entero en cada verificación y solo tolera dos casos
  anotados; el próximo parámetro sordo hace fallar el banco solo.

## 9. Antes de desplegar lo que ya está

- ~~Correr `scratch/_to_delete/urls_de_mseller.sql` (lote 103).~~ **Hecho el
  2026-09-14**: las 6 empresas vivas tienen ajustes (ninguna sin fila) y las 6
  usan `https://ecf.api.mseller.app/v1`. Con esa URL la regla nueva y las tres
  viejas (emisión, consulta, barrido) dan la misma dirección,
  `https://ecf.api.mseller.app`: el lote 103 no cambia nada para nadie, y
  antes tampoco hubo empresas emitiendo contra un servidor y consultando
  contra otro. **Volver a mirarlo** si alguna empresa configura una URL propia.
- Mirar la primera línea `[tiempos-pdf] render` que salga en producción, por lo
  dicho en la sección 7. **Desde el lote 113 lleva `motor` y `externo_ms`.**
  `dibujar` tiene tres caminos: `PDF_GENERATOR_MODE=external` (solo el
  externo), `PDF_SERVICE_URL` a secas (el externo PRIMERO, hasta 15 s, y si
  falla Puppeteer), o nada (Puppeteer). En Vercel no hay `PDF_GENERATOR_MODE`
  (dicho por el dueño el 2026-09-14); el `.env` local tiene
  `PDF_SERVICE_URL=http://localhost:3000`, la propia aplicación. **Si Vercel
  tiene `PDF_SERVICE_URL`**, cada PDF espera a que ese externo falle antes de
  dibujar: saldrá `motor: 'local tras fallo del externo'` con `externo_ms`
  alto, y la cura es quitar la variable, no montar un Gotenberg. Ojo también
  con la sección 7: pasar a Gotenberg "por el camino que ya existe" no es solo
  `PDF_SERVICE_URL`; sin `PDF_GENERATOR_MODE=external` sigue cayendo a
  Puppeteer cuando el externo falla.
- El gancho de pre-commit **está puesto** (comprobado en el lote 106:
  `.git/hooks/pre-commit` es idéntico a `scratch/_to_delete/pre-commit`).
  `pre-commit.nuevo` es distinto y no está instalado.

---

*Última actualización: lote 119.*
