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
  base real. Siguen en la lista; hacen falta una base desechable (Supabase
  local o una rama) para volver a vigilarlos.
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
  (`15e71ec`) llama a `/api/v1/cron/sincronizar-ecf` cada 5 minutos. Le falta
  CONFIGURACIÓN: `CRON_SECRET` en Vercel, el secreto `CRON_SECRET` en GitHub
  (mismo valor) y la variable `APP_URL` en GitHub. **Mientras falten, el
  workflow falla a propósito cada 5 minutos** (GitHub puede estar enviando
  avisos de fallo).
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
  consultar tampoco revierte asiento ni CxC (pendiente, otro lote). El cuadre
  contable de Latin Doors, que es donde salió, está en
  `docs/auditoria/cuadre_latin_doors_informe.md` (sin commitear).
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
