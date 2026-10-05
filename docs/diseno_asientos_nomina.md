# Diseño: la nómina llega al libro mayor

*Shiky, 2026-10-04. Es solo un diseño: no cambia ningún fichero del código. Las cifras salen de una medición de solo lectura en PRODUCCIÓN, con `scratch/_to_delete/medir_nomina_asientos.ts` y `medir_nomina_asientos2.ts`.*

## Resumen (10 líneas)

1. Hoy la nómina **calcula** sueldo, TSS e ISR, pero no asienta nada. Tampoco existe el paso de **pagar**: la nómina llega a "Aprobada" y ahí se queda.
2. En PRODUCCIÓN hay **1 nómina** (Latin Doors, quincena 15–30/07, "Calculada", sin aprobar) y **1 empleado**. Ninguna aprobada ni pagada, y **nada de nómina en el libro**: no queda ningún histórico sin asentar.
3. Propuesta: al **aprobar**, un asiento de devengo dentro de la misma transacción que el cambio de estado. Al **pagar** (pantalla nueva), un segundo asiento contra banco o caja, con su movimiento en el libro de banco o en la sesión de caja.
4. Hacen falta **7 claves nuevas** de Cuentas Puente en un bloque nuevo, **"Nómina"**. Dos cuentas ya existen en las seis empresas (6.1.01.01 y 6.1.01.02) y cinco se crean (6.1.01.03, 2.1.01.04, 2.1.02.04/05/06).
5. **No se usan 2.1.03 a 2.1.05**, porque en Latin Doors ya son ITBIS e ISR. Con esos códigos, el completador las habría enganchado a la cuenta equivocada.
6. El asiento al aprobar **no necesita migración**: se enlaza por `reference = id de la nómina`, como las facturas y las compras. Pagar sí necesita una tabla nueva (`pagos_de_nomina`), sin columnas nuevas en `payrolls`.
7. **Tres defectos previos que hay que cerrar antes**:
   - la escala de ISR está **vacía** en producción, así que el ISR siempre sale 0;
   - una nómina aprobada se puede **recalcular** por la API;
   - se puede aprobar un **borrador sin detalle**.
8. Los porcentajes de la TSS coinciden con la ley. Hay que confirmar con el contador la **base cotizable** (el código excluye horas extra y bonos), el **tope de salario mínimo** fijado en el código y el **Infotep del 0,5 % del empleado**, que no se calcula.
9. El pago a la TSS y a la DGII (IR-3) **ya se puede registrar** desde Bancos, con la cuenta por pagar como contrapartida (lote 137). No hace falta un módulo nuevo para empezar.
10. Son **4 lotes** (guardas → cuentas → asiento al aprobar → pagar), más uno opcional para revertir una aprobación. Las decisiones abiertas están en la sección 6.

---

## 1. Cómo es hoy la nómina

### Tablas (`src/db/schema/hr.ts`)

| Tabla | Para qué | Notas |
|---|---|---|
| `payrolls` (l. 100) | La nómina de un período | `status`: `draft · calculated · approved · paid · cancelled` (varchar). Lleva `period_start/end`, `payment_date`, `frequency` y `modo`. **No tiene nada de pago ni de contabilidad.** |
| `payroll_details` (l. 119) | Una fila por empleado | `base_salary, overtime_amount, bonus_amount, commission_amount, gross_salary, afp, sfs, isr, other_deductions, net_salary` y los aportes patronales `afp_employer, sfs_employer, risk_employer (SRL), infotep_employer`. |
| `overtime_records`, `employee_income`, `employee_deductions` | Novedades del período | Pasan de `pending` a `processed` al aprobar. |
| `payroll_configs` (l. 309) | Porcentajes por empresa | AFP 2,87/7,10 · SFS 3,04/7,09 · SRL 1,10 · Infotep 1,00 · recargos de horas extra. |
| `isr_brackets` (l. 299) | Escala de ISR | **Sin `company_id`**. La siembra `src/db/run-migration.ts:52-70` (escala 416.220 / 624.329 / 867.123). |
| `employee_settlements` | Liquidaciones | Preaviso, cesantía, vacaciones y navidad. La pantalla las guarda directamente como `paid` (`settlements/page.tsx:161`), sin forma de pago. |

### Ciclo de vida, rutas y servicio

- `POST /api/v1/hr/payroll` crea la nómina en `draft` (`hrRepository.createPayroll`, l. 303).
- `PUT ?id=…` con `action: 'recalculate'` llama a `recalculatePayrollTx` (l. 333): borra el detalle, lo vuelve a calcular con `PayrollCalculationService.calculateDetails` y deja la nómina en `calculated`. **No mira el estado**: una nómina aprobada vuelve a `calculated` con el detalle rehecho. La pantalla esconde el botón, pero la API lo admite.
- `PUT …` con `action: 'approve'` llama a `approvePayroll` (l. 543): admite **`calculated` o `draft`**, pasa a `approved`, marca las novedades como procesadas y escribe en la auditoría, todo en una transacción. Aprobar un `draft` aprueba una nómina **sin detalle**.
- `DELETE` (l. 638) solo borra `draft` o `calculated`.
- **No hay ninguna acción de pagar.** Nada pone una nómina en `paid` (búsqueda en `api/v1/hr`, `dashboard/hr` y el repositorio). Los volantes se imprimen en `payroll/[id]/receipts`.

### Qué se calcula (`src/services/payrollCalculationService.ts`)

| Concepto | Cómo | Línea |
|---|---|---|
| Bruto | salario del período + horas extra + bonos + comisiones | 145 |
| Base cotizable TSS | salario + comisiones (**sin horas extra ni bonos**) | 148 |
| AFP | 2,87 % empleado y 7,10 % empleador, con tope de 20 salarios mínimos | 151-154 |
| SFS | 3,04 % empleado y 7,09 % empleador, con tope de 10 salarios mínimos | 157-160 |
| SRL | 1,10 % empleador, con tope de 4 salarios mínimos | 166-168 |
| Infotep | 1 % empleador sobre la base cotizable, sin tope | 163 |
| ISR | (bruto − AFP − SFS) proyectado al año, por la escala; se divide entre 12 y entre la frecuencia | 172-175 |
| Neto | bruto − AFP − SFS − ISR − otras deducciones | 178 |
| Regalía (salario 13) | **No se calcula en la nómina.** Solo existe como "navidad proporcional" en la liquidación (l. 326). | — |
| Infotep 0,5 % de las bonificaciones del empleado | **No existe.** | — |

El salario mínimo para los topes está **fijado en el código**: `SALARIO_MINIMO_TSS = 16262.50` (l. 29).

### Cómo se paga hoy

No se paga desde el sistema: ni banco, ni caja, ni cheque. En PRODUCCIÓN no hay ningún movimiento de banco ni de caja que mencione nómina, sueldo o quincena, y ninguna compra con tipo de gasto 01 ("Gastos de Personal"). Es decir: **la nómina tampoco entra por compras**, así que asentarla no duplicaría nada.

## 2. Medición en PRODUCCIÓN (solo lectura, 2026-10-04)

| Qué | Resultado |
|---|---|
| Empresas | 6: Artalum, D'JIMENEZ, Empresa de Prueba, J'EDWARD, Latin Doors, UltraElec |
| Nóminas | **1**: Latin Doors, PRODUCCIÓN, quincenal, 15–30/07/2026, estado **`calculated`**. Ninguna aprobada, pagada ni borrada. |
| Empleados | **1** activo, en Latin Doors (quincenal) |
| Importes de esa nómina | Bruto 10.000,00 · AFP 287,00 · SFS 304,00 · ISR 0,00 · Neto 9.409,00 · AFP patronal 710,00 · SFS patronal 709,00 · SRL 110,00 · Infotep 100,00 |
| Cuadre del detalle | 1 de 1 línea cuadra (bruto − deducciones = neto) |
| Liquidaciones, horas extra, ingresos, deducciones | 0 filas |
| **Escala de ISR (`isr_brackets`)** | **0 filas.** Con la escala vacía, `calculateIsr` devuelve 0 siempre (l. 77). Hoy no hace daño (20.000 al mes está por debajo del tramo exento), pero cualquier sueldo de más de unos RD$36.000 mensuales saldría sin ISR retenido. |
| Asientos de nómina | **0** (ninguna descripción con nómina, sueldo, salario, TSS, Infotep ni regalía) |
| Cuentas 6.1.01.01 y 6.1.01.02 | Existen en las 6 empresas, con **0 renglones** |
| Claves de mapeo de nómina | Ninguna (17 claves, ninguna de nómina) |
| Configuración de nómina | Las 6 empresas con los porcentajes por defecto |
| Catálogo de Latin Doors | Tiene **2.1.03 ITBIS por Pagar, 2.1.04 ISR Retenido y 2.1.05 ITBIS Retenido**, con movimientos (los del lote 165). Las otras cinco no los tienen. |

**Lo que se quedaría sin asiento: nada.** La única nómina no está aprobada. Si se aprueba después del lote, se asentará **con fecha 30/07**. El período 07/2026 de Latin Doors en PRODUCCIÓN está **cerrado** (medido el mismo día), así que la aprobación se negaría con el mensaje de período cerrado. Ver la decisión D6.

## 3. El asiento propuesto

### Normativa y comprobación de los porcentajes

| Concepto | Ley | En el código | ¿Coincide? |
|---|---|---|---|
| SFS | Ley 87-01: 3,04 % empleado y 7,09 % empleador, tope 10 SMN | 3,04 / 7,09, tope 10 | Sí |
| AFP | 2,87 % empleado y 7,10 % empleador, tope 20 SMN | 2,87 / 7,10, tope 20 | Sí |
| SRL | Empleador, ~1,10 % según la clase de riesgo, tope 4 SMN | 1,10, configurable | Sí (confirmar la clase de riesgo de cada empresa) |
| Infotep empleador | Ley 116-80: 1 % de la nómina | 1 % sobre salario + comisiones | Hay que confirmar la base: el código deja fuera las horas extra y los bonos |
| Infotep empleado | 0,5 % de las bonificaciones | **No se calcula** | **No** |
| ISR asalariados | Ley 11-92, escala anual de la DGII | Escala correcta en la siembra y en las pruebas, pero **vacía en producción** | El cálculo coincide, el dato falta |
| Base cotizable TSS | Salario + comisiones (y lo que la TSS considere salario ordinario) | Excluye horas extra y bonos | A confirmar con el contador |
| Salario mínimo de los topes | El que fije la TSS cada año | 16.262,50, fijado en el código | A confirmar: no se actualiza solo |

### Momento 1: al APROBAR (devengo)

Es **un asiento por nómina**, con los importes sumados de todos sus empleados. Su fecha es el **fin del período** y su referencia, el id de la nómina. Si un importe es cero, su línea no se pone: `createJournalEntry` rechaza las líneas en cero.

| | Cuenta (clave) | Importe |
|---|---|---|
| Debe | Sueldos y salarios (`payroll_salaries_expense`) | Σ bruto |
| Debe | Aportes patronales TSS (`payroll_employer_tss_expense`) | Σ (AFP + SFS patronal + SRL) |
| Debe | Infotep (`payroll_infotep_expense`) | Σ Infotep del empleador |
| Haber | Sueldos por pagar (`payroll_salaries_payable`) | Σ neto |
| Haber | TSS por pagar (`payroll_tss_payable`) | Σ (AFP + SFS del empleado + AFP + SFS patronal + SRL) |
| Haber | ISR de asalariados por pagar (`payroll_isr_payable`) | Σ ISR |
| Haber | Infotep por pagar (`payroll_infotep_payable`) | Σ Infotep |
| Haber | Otras deducciones por pagar (`payroll_other_deductions`) | Σ otras deducciones |

Cuadra por construcción. Debe = bruto + patronales. Haber = neto + (TSS empleado + patronal) + ISR + Infotep + otras, y como neto = bruto − TSS empleado − ISR − otras, los dos lados suman lo mismo.

### Momento 2: al PAGAR

- **Debe**: Sueldos por pagar (Σ neto).
- **Haber**: depende de cómo se pague:
  - **transferencia o cheque**: la cuenta contable del banco elegido. Usa `resolverCuentaDeBanco` y el retiro queda pendiente de conciliar en el libro de banco, con la regla de los lotes 151, 163 y 170 (`saleDelBanco`, `reflejarEnBancoDeCompra`);
  - **efectivo**: la caja (`cash`) y su salida en la sesión abierta (`reflejarEnCaja` / `sesionParaEfectivo`, lote 169). Sin caja abierta, se niega.

  La fecha es la que se elija al pagar (por defecto, `payment_date`), y la referencia, el id del pago. La nómina pasa a `paid`.

### Pago a la TSS y a la DGII

**Queda fuera del primer tramo, y no hace falta para empezar.** Desde el lote 137, "Registrar movimiento" en Bancos exige una contrapartida, así que el contador ya puede registrar:
- el pago de la factura de la TSS: Debe 2.1.02.04 / Haber Banco;
- el pago del IR-3: Debe 2.1.02.05 / Haber Banco.

Las dos se pagan el mes siguiente. Un botón "Pagar TSS del mes" se puede hacer más adelante si se repite mucho.

### Ejemplo con la nómina real medida (Latin Doors, 15–30/07, 1 empleado)

**Al aprobar** (fecha 30/07/2026):

| Cuenta | Debe | Haber |
|---|---:|---:|
| 6.1.01.01 Sueldos y Salarios | 10.000,00 | |
| 6.1.01.02 Aportes Patronales TSS (710 + 709 + 110) | 1.529,00 | |
| 6.1.01.03 Infotep | 100,00 | |
| 2.1.01.04 Sueldos por Pagar | | 9.409,00 |
| 2.1.02.04 TSS por Pagar (287 + 304 + 710 + 709 + 110) | | 2.120,00 |
| 2.1.02.06 Infotep por Pagar | | 100,00 |
| *(ISR 0 y otras deducciones 0: sin línea)* | | |
| **Total** | **11.629,00** | **11.629,00** |

**Al pagar**, por transferencia desde Banreservas:

| Cuenta | Debe | Haber |
|---|---:|---:|
| 2.1.01.04 Sueldos por Pagar | 9.409,00 | |
| 1.1.01.03 Banco de Reservas | | 9.409,00 |

A esto se suma el retiro de 9.409,00 en el libro de Banreservas, pendiente de conciliar.

## 4. Claves nuevas de `CUENTAS_DEL_SISTEMA`

Todas van en una categoría nueva, `'nomina'`, con el bloque **"Nómina"** en Cuentas Puente: *"Sueldos, aportes a la TSS, Infotep y retenciones de ISR de los empleados: lo que la nómina asienta al aprobarse y paga después."*

| Clave | Código | Nombre | Tipo / naturaleza | ¿Existe? |
|---|---|---|---|---|
| `payroll_salaries_expense` | 6.1.01.01 | Sueldos y Salarios | gasto / deudora | **Sí**, en las 6 empresas (0 renglones) |
| `payroll_employer_tss_expense` | 6.1.01.02 | Aportes Patronales TSS | gasto / deudora | **Sí**, en las 6, pero se llama *"Retenciones TSS (SFS/AFP/TSS)"* (ver D7) |
| `payroll_infotep_expense` | 6.1.01.03 | Aporte Infotep | gasto / deudora | No: se crea bajo 6.1.01 (existe en las 6) |
| `payroll_salaries_payable` | 2.1.01.04 | Sueldos por Pagar | pasivo / acreedora | No: se crea bajo 2.1.01 |
| `payroll_tss_payable` | 2.1.02.04 | TSS por Pagar (AFP, SFS, SRL) | pasivo / acreedora | No: se crea bajo 2.1.02 |
| `payroll_isr_payable` | 2.1.02.05 | ISR Retenido a Asalariados por Pagar | pasivo / acreedora | No: se crea bajo 2.1.02 |
| `payroll_infotep_payable` | 2.1.02.06 | Infotep por Pagar | pasivo / acreedora | No: se crea bajo 2.1.02 |
| `payroll_other_deductions` | 2.1.01.02 | Otras Cuentas por Pagar | pasivo / acreedora | **Sí**, en las 6 (0 renglones). Ver D5. |

Por qué estos códigos:

- **No se usan 2.1.03, 2.1.04 ni 2.1.05.** En Latin Doors ya existen como ITBIS e ISR, son transaccionales y tienen movimientos. `planParaCompletar` habría enlazado "Sueldos por pagar" a "ITBIS por Pagar" **sin avisar**, porque la cuenta "sirve" por tipo.
- **El ISR de asalariados no comparte cuenta con 2.1.02.03** (retenciones a terceros). Se declaran en formularios distintos: el IR-3 para asalariados y el IR-17 para terceros. Con la misma cuenta, el contador no podría cuadrar cada declaración con su saldo.
- **2.1.01.02 "Otras cuentas por pagar"** se usa como valor por defecto de las otras deducciones porque ya existe y nadie la usa. El contador la puede repuntar.

Hay que tocarlas en los cuatro sitios del lote 171: la tabla, el sembrador (`seedDefaultChartOfAccounts`, `accountingRepository.ts:811`, que gana 6.1.01.03, 2.1.01.04, 2.1.02.04, 2.1.02.05 y 2.1.02.06), `completarCuentasDelSistema` (sin cambios, porque deriva de la tabla) y la pantalla (sin cambios, porque `GRUPOS_DE_PUENTES` se deriva). Para las empresas existentes se usa el guion de siempre, `scratch/_to_delete/completar_cuentas_empresas.ts --aplicar`, que lanza el dueño. En las seis crea las cinco cuentas que faltan y enlaza las 8 claves sin mover saldos.

## 5. Cambios de código, por fichero

**Lote A: guardas (antes de asentar nada)**
- `hrRepository.recalculatePayrollTx`: solo `draft` o `calculated`. Hoy rehace una nómina aprobada, y con asiento eso dejaría el libro distinto del detalle.
- `hrRepository.approvePayroll`: solo `calculated` **y** con al menos una línea de detalle. Un borrador no tiene importes.
- **Escala de ISR**: está vacía en producción. La tabla no tiene empresa y la siembra `run-migration.ts`, que no se corrió aquí. Se carga con un guion de datos (ensayo + `--aplicar`, lo lanza el dueño), con la escala vigente que confirme el contador. Además, `recalculatePayrollTx` debe **negarse a calcular** si no hay escala: hoy la escala vacía calcula un ISR de 0 en silencio.

**Lote B: las cuentas**
- `services/accounting/cuentasDelSistema.ts`: categoría `'nomina'`, el bloque en `BLOQUES` y las 8 entradas.
- `repositories/accountingRepository.ts` (sembrador): las cinco cuentas nuevas, y el nombre de 6.1.01.02 para las empresas **nuevas** (D7).
- **Bancos**: `scratch/verificar_cuentas_puente.ts`, l. 158-161, tiene dos comprobaciones que dicen "la nómina no asienta". Se **invierten, no se borran** (lo pide su propio comentario). `src/tests/cuentasDelSistema.vitest.ts` mantiene el sembrador y la tabla iguales. El banco nuevo comprueba que ninguna clave de nómina caiga en 2.1.03–2.1.05: ejecuta `planParaCompletar` con el catálogo de Latin Doors y exige que no enganche nada a esas cuentas.

**Lote C: el asiento al aprobar**
- `services/nomina/asientoDeNomina.ts` (**puro**): recibe las líneas de detalle y las cuentas resueltas, y devuelve las líneas del asiento, sin ceros, redondeadas a centavos, con el cuadre comprobado. Así se puede ejecutar en un banco sin base de datos.
- `hrRepository.approvePayroll`: dentro de **la misma transacción**, antes de marcar `approved`:
  1. resuelve las claves con `resolverCuentaPorMapeo`;
  2. arma las líneas con `asientoDeNomina`;
  3. llama a `AccountingRepository.createJournalEntry(tx, { reference: payrollId, date: periodEnd, createdBy: userId, … })`.

  Si el período está cerrado o falta una cuenta, la aprobación entera se deshace y el mensaje lo dice.
- **Migración: ninguna.** El enlace es `journal_entries.reference = payroll.id`, la convención de las facturas, las compras y `efectoEnCuenta.ts`. No se añade `journal_entry_id` a `payrolls`. Es la lección de las 0013 y 0015: `findPayrollById` y `recalculatePayrollTx` leen la fila entera con `select()`, y una columna declarada antes de migrar tumbaría la nómina.
- **Bancos**:
  - `verificar_asiento_nomina.ts` (de código): regla ejecutada, cuadre, sin líneas en cero, el ejemplo real;
  - `verificar_asiento_nomina_db.ts` (de integración, base desechable): aprobar asienta; un período cerrado deja la nómina en `calculated` sin asiento; aprobar dos veces no asienta dos veces; recalcular una aprobada se niega.

**Lote D: pagar**
- **Migración `drizzle/0020_pagos_de_nomina.sql`**: una tabla nueva, `pagos_de_nomina` (`id, company_id, modo, payroll_id, fecha, metodo, bank_account_id, monto, created_by, created_at`). La tabla es aparte, y no son columnas en `payrolls`, por el mismo motivo de arriba. Sin la migración, pagar contesta 409 nombrándola, como en las 0016 a 0019; el resto de la nómina sigue funcionando.
- `POST /api/v1/hr/payroll/[id]/pay` (permiso `nomina:write`):
  1. comprueba que la nómina esté `approved`;
  2. valida el método y el banco con `motivoParaNoRegistrarPago` y `motivoCuentaDelBanco`;
  3. inserta el pago;
  4. asienta (Debe sueldos por pagar / Haber banco o caja, `reference = pago.id`);
  5. refleja el retiro en el banco o la salida en la caja;
  6. pone la nómina en `paid`.

  Todo en una transacción.
- `dashboard/hr/payroll/page.tsx` (575 líneas): botón "Pagar nómina" con la ventana común `Modal`: método, banco, fecha y el neto total. **Conviene partir la página antes** si pasa de 600 líneas.
- **Bancos**: integración con los tres métodos (el banco baja y su libro tiene el retiro; la caja sin sesión se niega; pagar dos veces se niega).

**Lote E (opcional): revertir una aprobación**
- Solo si no está pagada. Usa `revertirAsientoContable` (que ya evita revertir dos veces), devuelve las novedades a `pending` y la nómina a `calculated`. Hoy esa acción no existe. Si el dueño no la necesita, no se hace: una nómina aprobada por error se corregiría con un asiento del contador.

## 6. Decisiones que necesitan al dueño o al contador

| # | Pregunta | Recomendación |
|---|---|---|
| D1 | ¿Un asiento por nómina o por empleado? | **Por nómina.** El detalle por empleado ya vive en `payroll_details` y en los volantes. Un asiento por persona llena el diario sin dar información contable nueva. |
| D2 | ¿Centro de costo o departamento? | **No.** Las líneas de asiento no tienen centro de costo y la empresa tiene un empleado. Si algún día hace falta, se separa por cuentas (sueldos de ventas / de administración). |
| D3 | ¿La regalía (salario 13) y las vacaciones se provisionan cada mes o al pagarse? | **Provisionarlas cada mes, pero en un lote aparte, después de este.** Las NIIF para PYMES piden reconocer el gasto cuando se devenga: 1/12 del salario ordinario para la regalía (exenta de TSS y de ISR hasta 5 salarios mínimos). Hoy la regalía ni siquiera se calcula en la nómina. Mientras tanto, se asienta cuando se pague. |
| D4 | ¿El pago de la TSS y del IR-3 lo registra este módulo? | **No, por ahora.** Se registra desde Bancos con la contrapartida 2.1.02.04 o 2.1.02.05, como cualquier pago a un tercero. Se revisa cuando haya varios meses de uso. |
| D5 | ¿A dónde van las "otras deducciones" (préstamos, cooperativa, seguro, embargo)? | **2.1.01.02 Otras Cuentas por Pagar por defecto.** Si son préstamos que dio la empresa, el contador debería apuntar la clave a 1.1.02.02 (Otras Cuentas por Cobrar), porque el descuento cobra el préstamo y no crea una deuda. Si hay de los dos tipos, hará falta separar la deducción por tipo (otro lote). |
| D6 | ¿Qué pasa con la única nómina que existe (Latin Doors, julio, "Calculada")? | **Que el dueño decida si es real.** Si es de prueba, eliminarla (se puede, porque está calculada). Si es real y se pagó por fuera, el contador la asienta a mano en el período que corresponda: aprobarla en el sistema intentaría asentar en julio, que está cerrado. No se asienta nada hacia atrás sin que se pida. **Decidido por el dueño (2026-10-04): es REAL.** No se elimina; la asienta el contador a mano, y en el sistema se queda como está. |
| D7 | La cuenta 6.1.01.02 se llama "Retenciones TSS (SFS/AFP/TSS)", y las retenciones no son gasto. | **Usarla para los aportes patronales** (es lo que es por naturaleza). Corregir el nombre en el sembrador para las empresas nuevas, y que el contador la renombre en las seis existentes (0 renglones, sin efecto en saldos). El código no renombra datos. |
| D8 | ¿Infotep y TSS en cuentas separadas? | **Separadas por defecto.** El contador puede apuntar las dos claves a la misma cuenta si así lo prefiere. |
| D9 | ¿Las horas extra y los bonos cotizan a la TSS y al Infotep? ¿Se calcula el 0,5 % de Infotep del empleado? | **Que lo confirme el contador antes del lote C.** El asiento refleja lo que calcula la nómina; si el cálculo está mal, el libro también.  **Decidido por el contador (2026-10-04): las horas extra y los bonos NO cotizan a la TSS (como ya calcula el código), y el 0,5 % de Infotep del empleado NO se calcula.** |
| D10 | ¿Fecha del asiento de devengo: fin del período o fecha de pago? | **Fin del período**, porque es cuando se devenga. En una quincena que acaba el 15 coinciden casi siempre. |
| D11 | ¿Se necesita "revertir aprobación" (lote E)? | **No al principio.** Se añade si en la práctica se aprueban nóminas por error. |
| D12 | El salario mínimo de los topes está fijado en el código (16.262,50). | **Pasarlo a la configuración de nómina** en otro lote, con el valor que confirme el contador para 2026.  **Decidido por el contador (2026-10-04): 10.000.** Pasa a la configuración de nómina en el lote 290. Y sobre la escala del ISR: **por ahora se sigue con la de 2026** — sin escala del año, se usa la más reciente anterior y la nómina avisa. |

## 7. Riesgos y tamaño

**Orden propuesto** (cada lote es un PR):

1. **Lote A, guardas y escala de ISR.** Es pequeño. Va primero porque asentar encima de una nómina que se puede recalcular después de aprobada metería en el libro importes que el detalle ya no tiene.
2. **Lote B, cuentas y bloque "Nómina".** Es mediano, y después hay que correr el guion de completar en las seis empresas. Sin las cuentas, aprobar fallaría con "no hay cuenta configurada".
3. **Lote C, asiento al aprobar.** Es mediano. Es el corazón del pedido del dueño.
4. **Lote D, pagar.** Es el más grande: migración, ruta, pantalla, banco y caja, y probablemente partir `payroll/page.tsx`.
5. *(Opcional)* **Lote E, revertir aprobación**, y luego regalía y vacaciones provisionadas (D3) y el asiento de liquidaciones.

**Riesgos**:
- **Período cerrado**: aprobar fallará si el fin del período cae en un mes cerrado. Es lo correcto, pero el mensaje tiene que decir qué hacer, que es lo que ya hace `createJournalEntry`.
- **Cuentas que no existen**: en las empresas a las que no se les corra el guion de completar, aprobar se negará. Es preferible a asentar mal.
- **La escala de ISR vacía**: si el lote A no se hace, el asiento diría "ISR 0" con la apariencia de un dato oficial.
- **Latin Doors 2.1.03 a 2.1.05**: con los códigos propuestos no se tocan. El banco del lote B lo vigila.
- **Liquidaciones**: siguen sin asiento ni forma de pago (se guardan como "pagadas" directamente). No entran en este diseño. Hay que anotarlo como el siguiente hueco.
