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
