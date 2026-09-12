# Fechas corridas un día: barrido de `src/`

Informe, **sin tocar nada**. 12/09/2026.

## El fallo

Las columnas `date` de Postgres llegan por drizzle como la cadena `'AAAA-MM-DD'`. Convertirla con `new Date(...)` la lee como **medianoche UTC**; en RD (UTC-4) eso es el día anterior. `d.setHours(0,0,0,0)` no lo arregla: fija la medianoche del día equivocado.

Una **marca de tiempo** (`timestamp`) es otra cosa: ahí `new Date(...)` es correcto.

## Dos correcciones a lo que dije antes

1. **No eran 56 sitios.** Aquel número salió de los ficheros que yo había traído a mi espacio, no de `src/` entero.
2. **No eran 441 ficheros.** El listado recursivo se cortaba en 61 carpetas de `src/app/api/`. El total real es **515**.

## Cobertura

| | ficheros |
|---|---|
| Total real bajo `src/` | 515 |
| Excluidos (7 ya arreglados + `src/tests/`) | 27 |
| A revisar | 488 |
| **Revisados** | **467** |
| **No alcanzables** | **21** |

Los 21 fallan todos por lo mismo: `device_stage_files` no baja más de **7 carpetas** por debajo de la carpeta conectada, y están a 8 o 9. Se arregla conectando desde la app de escritorio una carpeta más honda (p. ej. `...\src\app\api\v1`).

**El hueco no es inocuo:** son rutas de impresión de estados de cuenta, cuadres de caja, recibos de nómina y balances por antigüedad — justo el perfil donde este fallo suele estar.

```
api/v1/ar/receipts/[id]/print          api/v1/hr/payroll/[id]/receipts
api/v1/ar/receipts/by-customer/print   api/v1/hr/settlements/[id]/print
api/v1/financial/statements/customers/[id]{,/print}
api/v1/financial/statements/suppliers/[id]{,/print}
api/v1/reports/balances/customers/print
api/v1/reports/balances/suppliers/print
api/v1/cash/sessions/[id]/{approve,close,movements,print,summary,ticket}
api/v1/bank/accounts/[id]/transactions
api/v1/admin/companies/[id]/clear-sandbox
api/v1/admin/roles/[id]/permissions    api/v1/admin/users/[id]/permissions
api/v1/agent/proposals/[id]/action
```

## Resultado

673 `new Date(` en total, 345 con argumento, 144 tocan un campo solo-día. Tras leer el contexto de cada uno: **103 sospechosos en 28 ficheros**, 41 descartados.

`P` = se pinta · `C` = se compara · `D` = se calculan días

### Dinero — cálculo de días y tramos (11)

| ruta:línea | campo | uso |
|---|---|---|
| `api/v1/reports/balances/customers/route.ts:67,71` | dueDate | D |
| `api/v1/reports/balances/suppliers/route.ts:67,71` | dueDate | D |
| `repositories/financialRepository.ts:134,150,418,434` | dueDate | C, D |
| `services/payrollCalculationService.ts:263,264` | hireDate, terminationDate | D |
| `api/v1/hr/settlements/route.ts:62,63` | hireDate, terminationDate | D |

Dos matices que cambian la gravedad:

- **`reports/balances/*` es el error puro y el peor.** `today` sale en medianoche **local**; `due` sale en medianoche **UTC** y el `setHours` lo fija en la local del **día anterior**. Los dos lados no están en la misma escala: `diffDays` sale **inflado en 1 siempre**, y eso mueve saldos de tramo (30 días exactos cae en "31-60").
- **`financialRepository.ts` es menos grave.** Ahí `today` sale de `toISOString()`, así que los dos lados son UTC y el cálculo es consistente — salvo **entre las 20:00 y las 24:00 hora RD**, cuando `toISOString()` ya devuelve el día siguiente. Fallo real, pero intermitente.

### Dinero — "está vencido" que suma saldos (8)

`api/v1/reports/receivables/print/route.ts:63` · `api/v1/reports/payables/print/route.ts:59` · `dashboard/receivables-report/page.tsx:124,305` · `dashboard/receivables/page.tsx:544` · `dashboard/ap/page.tsx:603` · `utils/templates/documentTemplates.ts:1447,1554,1650,4548,4652`

Todas adelantan el vencimiento 24 h: una factura que vence **hoy** se pinta y se suma como vencida.

### Fiscal — sale hacia la DGII (1)

`services/dgii/secuencia.ts:77` — `aFechaDgii` (51-55) usa getters **locales** sobre una medianoche UTC → devuelve el día anterior. Ese `dd-MM-aaaa` es el vencimiento de la secuencia e-CF que **se envía** en el comprobante.

### RRHH — antigüedad y periodos (13)

`dashboard/hr/vacations/page.tsx:27` · `dashboard/hr/settlements/page.tsx:73,77,84,85,401,519,623` · `dashboard/hr/payroll/page.tsx:225,228,244,290,292,369,372` · `dashboard/hr/overtime/page.tsx:349`

`vacations:27` y `settlements:73-85` alimentan días de vacaciones y regalía/preaviso/cesantía: es dinero, no pintura.

### Filtros de rango (11)

`api/v1/inventory/movements/route.ts:42,47` · `ai/tools/GetSalesSummaryTool.ts:42,46` · `repositories/biRepository.ts:296,297,326,327,516,600,601`

En los dos primeros el rango entero se corre 24 h y **el último día del filtro queda fuera**. El patrón correcto ya existe en casa: `api/v1/invoices/report/route.ts:61,65` y `repositories/invoiceRepository.ts:364,368` usan `` `${startDate}T00:00:00-04:00` ``.

### Solo pintura (59)

| ruta | sitios |
|---|---|
| `utils/templates/documentTemplates.ts` | 16 |
| `services/pdfGenerator.ts` | 7 |
| `dashboard/accounting/page.tsx` | 8 |
| `dashboard/receivables/page.tsx` | 5 |
| `dashboard/bank/page.tsx` | 3 |
| `dashboard/reports/bank-reconciliation/page.tsx` | 3 |
| `dashboard/customers/[id]/page.tsx` | 2 |
| `api/v1/invoices/[id]/{email,pdf,print}` + `services/invoice/correoFactura.ts` | 4 |
| resto | 11 |

El peor de estos: `documentTemplates.ts:1207` — el **conduce siempre imprime el día anterior**.

## Descartados que más confunden

- `apRepository.ts:17`, `accountingRepository.ts:69` — hay un `match(/^(\d{4}-\d{2}-\d{2})/)` tres líneas antes que devuelve la cadena tal cual.
- ~24 sitios `new Date(x).toISOString().split('T')[0]` — ida y vuelta limpia por UTC.
- `expenses/route.ts:376`, `expenses/[id]/route.ts:1263` — pasan por `formatLocalDate`, que detecta la medianoche UTC.
- `carteraRepository.ts:277,474,546` y `receivables/page.tsx:549` — nombres en español que gritan "fecha", pero son `createdAt`.
- `msellerClient.ts:777` — `issueDate` está tipado `Date` y los dos llamadores le pasan `Date` real.
- `financial/customers/page.tsx:541` y cinco más — usan `new Date(m.date + 'T00:00:00')`: eso es el arreglo, no el fallo.
- `receivables/page.tsx:867,868,885,886` — los dos lados se corren igual en un `sort`; el orden no cambia.

## Prioridad recomendada

**1. `api/v1/reports/balances/{customers,suppliers}/route.ts`** (4 líneas, 2 ficheros gemelos). El único sitio con el error puro: inflado en 1 todo el día, todos los días, y reparte saldos entre tramos. El informe de antigüedad es lo que se mira para decidir a quién se cobra.

**2. `payrollCalculationService.ts:263-264` + `api/v1/hr/settlements/route.ts:62-63` + `dashboard/hr/settlements/page.tsx:73-85`.** La misma cuenta hecha tres veces y descoordinada: cliente y servidor pueden ya dar cifras distintas. En los bordes cruza el umbral de meses y salta un tramo de cesantía. Es dinero que se le paga a una persona, con soporte legal detrás.

**3. `services/dgii/secuencia.ts:77`.** El único que sale del sistema: la fecha que se **envía** a la DGII, siempre un día antes. El propio fichero dice *"No se envia el comprobante con una fecha supuesta"* y justo debajo manda una. Cinco líneas.

Justo después: `documentTemplates.ts` (16) y `pdfGenerator.ts` (7), en una pasada mecánica con `formatDateDisplay`. No mueven totales, pero son los PDF que recibe el cliente.

## Duda abierta

`receiptDate` y `asOf` se trataron como solo-día (`arRepository.ts:420` lo confirma para el primero; el segundo nace de `getDRLocalDateString()`), pero **no están en la lista de campos del esquema**. Con criterio estricto, descuenta 5 sitios de "pintura" y quedan 98.
