/**
 * Dar de baja un comprobante que la DGII rechazo despues de contabilizado.
 *
 * EL HUECO (lote 140)
 * -------------------
 * Rechazado al emitir, un comprobante se guarda sin efectos. Rechazado DESPUES
 * -- por la consulta de estado -- conserva asiento, CxC y movimiento del
 * cliente. Medido el 2026-09-16: E340000000002 en PRODUCCION y dos e-44 en
 * PRUEBA. Decidido por el dueño: NO se revierte solo (un rechazado se puede
 * reenviar con el mismo e-NCF, y un reenvio aceptado no recontabiliza); se da
 * de baja con una accion deliberada, que se niega cuando no es seguro.
 *
 * QUE SE EJECUTA Y QUE SE LEE
 * ---------------------------
 * Se EJECUTA lo que no necesita base de datos: el reparto del asiento, contra
 * una transcripcion literal del algoritmo que habia en `invoiceDbBooker` antes
 * del lote (la emision tiene que salir identica); el asiento contrario; la
 * negativa; el recalculo de la CxC. La transaccion no se ejecuta: escribe, y los
 * bancos no escriben en la base real (ver la deuda de bancos del traspaso). Su
 * cableado se lee.
 */
import { fuente } from './_fuente';

//  `@/db` exige DATABASE_URL al cargarse, aunque aqui no se consulte nada. Se le
//  da una direccion que NO lleva a ninguna base (puerto 1 de la propia maquina):
//  postgres.js no conecta hasta la primera consulta, y si algo del banco llegara
//  a consultar, fallaria en vez de escribir en la base real.
process.env.DATABASE_URL = 'postgres://banco:banco@127.0.0.1:1/banco_sin_base';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};
const exige = (t: string, c: boolean, d = '') => {
  if (!c) throw new Error(`PRECONDICION ROTA: ${t}${d ? ` -- ${d}` : ''}`);
  console.log(`  pre   ${t}`);
};
/** El cuerpo de una funcion o bloque, con las llaves emparejadas desde `ancla`. */
const bloque = (src: string, ancla: string): string => {
  const i = src.indexOf(ancla);
  if (i < 0) return '';
  const j = src.indexOf('{', i + ancla.length - 1);
  let n = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') n++;
    else if (src[k] === '}') { n--; if (n === 0) return src.slice(i, k + 1); }
  }
  return '';
};

type Linea = { accountId: string; debit: number; credit: number };
type Ret = { retentionType: string; retentionAmount: number };
interface Caso { ecfType: string; paymentType: string; subtotal: number; totalDiscount: number; totalTaxes: number; totalNet: number; totalRetained: number; retenciones: Ret[] }

const CUENTAS = {
  cxc: 'CXC', caja: 'CAJA', ventas: 'VENTAS', itbis: 'ITBIS',
  isrRetenido: 'RET-ISR', itbisRetenido: 'RET-ITBIS', otrasRetenciones: 'RET-OTRA',
};

/**
 * EL ORACULO: el reparto tal y como estaba escrito en
 * `InvoiceDbBooker.executeDbTransaction` en HEAD antes del lote 140 (933c31d y
 * aadc2ef), con las llamadas al resolvedor sustituidas por las cuentas fijas.
 * Si la extraccion cambia UNA linea, un importe o el orden, esto lo ve.
 */
function asientoDeAntes(c: Caso): Linea[] {
  const isCashOrBank = c.paymentType === 'cash' || c.paymentType === 'bank_transfer';
  const paymentAccount = isCashOrBank ? CUENTAS.caja : CUENTAS.cxc;
  let journalLines: Linea[] = [];
  if (c.ecfType === '34') {
    const creditAmount = c.totalNet;
    journalLines = [
      { accountId: CUENTAS.ventas, debit: c.subtotal - c.totalDiscount, credit: 0 },
      { accountId: paymentAccount, debit: 0, credit: creditAmount },
    ];
    if (c.totalTaxes > 0) journalLines.unshift({ accountId: CUENTAS.itbis, debit: c.totalTaxes, credit: 0 });
    if (c.totalRetained > 0) {
      for (const ret of c.retenciones) {
        const acc = ret.retentionType === 'ISR' ? CUENTAS.isrRetenido : ret.retentionType === 'ITBIS' ? CUENTAS.itbisRetenido : CUENTAS.otrasRetenciones;
        journalLines.push({ accountId: acc, debit: 0, credit: ret.retentionAmount });
      }
    }
  } else {
    journalLines = [
      { accountId: paymentAccount, debit: c.totalNet, credit: 0 },
      { accountId: CUENTAS.ventas, debit: 0, credit: c.subtotal - c.totalDiscount },
    ];
    if (c.totalTaxes > 0) journalLines.push({ accountId: CUENTAS.itbis, debit: 0, credit: c.totalTaxes });
    if (c.totalRetained > 0) {
      for (const ret of c.retenciones) {
        const acc = ret.retentionType === 'ISR' ? CUENTAS.isrRetenido : ret.retentionType === 'ITBIS' ? CUENTAS.itbisRetenido : CUENTAS.otrasRetenciones;
        journalLines.push({ accountId: acc, debit: ret.retentionAmount, credit: 0 });
      }
    }
  }
  return journalLines;
}

/** Todas las combinaciones que la emision distingue. */
function casos(): Caso[] {
  const salida: Caso[] = [];
  const retenciones: Ret[][] = [
    [],
    [{ retentionType: 'ISR', retentionAmount: 100 }],
    [{ retentionType: 'ITBIS', retentionAmount: 54 }, { retentionType: 'OTRA', retentionAmount: 10 }],
  ];
  for (const ecfType of ['31', '32', '33', '34', '44']) {
    for (const paymentType of ['credit', 'cash', 'bank_transfer']) {
      for (const itbis of [0, 180]) {
        for (const descuento of [0, 25]) {
          for (const rets of retenciones) {
            const subtotal = 1000;
            const total = subtotal - descuento + itbis;
            const totalRetained = rets.reduce((s, r) => s + r.retentionAmount, 0);
            salida.push({ ecfType, paymentType, subtotal, totalDiscount: descuento, totalTaxes: itbis, totalNet: total - totalRetained, totalRetained, retenciones: rets });
          }
        }
      }
    }
  }
  return salida;
}

async function main() {
  console.log('\n0) Precondiciones\n');
  {
    const reenviar = fuente('src/app/api/v1/ecf/[id]/resubmit/route.ts');
    const permitidos = (reenviar.match(/!\[([^\]]+)\]\.includes\(invoice\.status\)/) || [])[1] ?? '';
    exige('"Reenviar" NO admite un comprobante en void', permitidos.includes("'rejected'") && !permitidos.includes("'void'"), permitidos);
    //  Lote 141: los dos pasaron de `ne(status, 'void')` a una lista compartida,
    //  ESTADOS_FUERA_DEL_607, que tambien saca los rechazados. Lo que se fija es
    //  lo mismo: `void` no entra. Vale en las dos formas.
    const excluyeVoid = (ruta: string): boolean => {
      const src = fuente(ruta);
      if (/ne\(invoices\.status, 'void'\)/.test(src)) return true;
      let lista = '';
      try { lista = fuente('src/services/dgii/estadosReportables.ts'); } catch { return false; }
      return /notInArray\(invoices\.status, ESTADOS_FUERA_DEL_607\)/.test(src)
        && /export const ESTADOS_FUERA_DEL_607 = \[[^\]]*'void'[^\]]*\]/.test(lista);
    };
    exige('el TXT del 607 excluye void', excluyeVoid('src/app/api/v1/reports/607/txt/route.ts'));
    exige('el libro de ventas excluye void', excluyeVoid('src/app/api/v1/reports/sales-book/route.ts'));
    exige('una nota en void no cuenta como ajuste de su factura', /ESTADOS_QUE_NO_AJUSTAN = \['rejected', 'void'\]/.test(fuente('src/app/api/v1/ecf/route.ts')));
    exige('el guardian de asientos rechaza las cuentas de agrupacion', /!cuenta\.isTransactional/.test(fuente('src/repositories/accountingRepository.ts')));
    const n = casos().length;
    exige(`el oraculo cubre todas las combinaciones (${n})`, n === 5 * 3 * 2 * 2 * 3);
  }

  const cargar = async <T>(ruta: string): Promise<T | null> => {
    try {
      return (await import(ruta)) as T;
    } catch (e) {
      console.log(`  (no se pudo cargar ${ruta}: ${(e as Error).message.split('\n')[0].slice(0, 120)})`);
      return null;
    }
  };
  const asiento = await cargar<typeof import('../src/services/invoice/asientoDeFactura')>('../src/services/invoice/asientoDeFactura');
  const baja = await cargar<typeof import('../src/services/invoice/bajaDeRechazado')>('../src/services/invoice/bajaDeRechazado');

  console.log('\n1) La emision sale IDENTICA a la de antes del lote\n');
  {
    const todos = casos();
    const distintos = asiento
      ? todos.filter((c) => JSON.stringify(asiento.lineasDeVenta(CUENTAS, c)) !== JSON.stringify(asientoDeAntes(c)))
      : todos;
    ok(`las ${todos.length} combinaciones dan las mismas lineas, importes y orden`,
      !!asiento && distintos.length === 0, asiento ? `${distintos.length} distintas` : 'no existe asientoDeFactura.ts');

    const booker = fuente('src/services/invoice/invoiceDbBooker.ts');
    ok('la emision usa el reparto compartido',
      booker.includes("from './asientoDeFactura';")
      && /const journalLines = lineasDeVenta\(cuentasDeVenta, importesDeVenta\);/.test(booker)
      && /await AccountRepository\.createJournalEntry\(tx, \{[\s\S]{0,300}lines: journalLines,/.test(booker));
    //  Resolver no se puede ejecutar sin base. Lo que importa de su forma: las
    //  cuentas de retencion se piden SOLO si la venta retiene, como antes. Si se
    //  pidieran siempre, una empresa sin esas cuentas dejaria de poder facturar.
    {
      let fuenteAsiento = '';
      try { fuenteAsiento = fuente('src/services/invoice/asientoDeFactura.ts'); } catch { fuenteAsiento = ''; }
      const resolver = bloque(fuenteAsiento, '): Promise<CuentasDeVenta> {');
      ok('las cuentas de retencion solo se resuelven si la venta retiene',
        /const retiene = importes\.totalRetained > 0;/.test(resolver)
        && /const hay = \(tipo: string\) => retiene && /.test(resolver)
        && /const hayOtras = retiene && /.test(resolver)
        && (resolver.match(/\? \(await resolverCuentaPorMapeo\(/g) || []).length === 3);
    }
    ok('y ya no lleva su propia copia del reparto (con el import presente)',
      booker.includes("from './asientoDeFactura';")
      && !/'sales_revenue'/.test(booker) && !/journalLines\.unshift/.test(booker));
  }

  console.log('\n2) La baja es el asiento CONTRARIO, exacto\n');
  {
    const todos = casos();
    const residuo = (c: Caso): number => {
      if (!asiento) return Infinity;
      const saldo = new Map<string, number>();
      for (const l of [...asiento.lineasDeVenta(CUENTAS, c), ...asiento.lineasDeVenta(CUENTAS, c, true)]) {
        saldo.set(l.accountId, (saldo.get(l.accountId) ?? 0) + l.debit - l.credit);
      }
      return Math.max(...[...saldo.values()].map(Math.abs));
    };
    const malos = todos.filter((c) => residuo(c) > 0.001);
    ok(`emision + baja dejan CADA cuenta en cero (${todos.length} combinaciones)`, !!asiento && malos.length === 0, `${malos.length} con residuo`);

    const descuadres = asiento ? todos.filter((c) => {
      const l = asiento.lineasDeVenta(CUENTAS, c, true);
      return Math.abs(l.reduce((s, x) => s + x.debit - x.credit, 0)) > 0.001;
    }) : todos;
    ok('y la baja cuadra por si sola', !!asiento && descuadres.length === 0);

    // EL CASO REAL: la nota E340000000002 (credito, 25.680 + ITBIS 4.622,40).
    // Su baja tiene que ser PR-8a del informe del cuadre.
    const nota0002: Caso = { ecfType: '34', paymentType: 'credit', subtotal: 25680, totalDiscount: 0, totalTaxes: 4622.4, totalNet: 30302.4, totalRetained: 0, retenciones: [] };
    const pr8a = asiento ? asiento.lineasDeVenta(CUENTAS, nota0002, true) : [];
    ok('E340000000002: Debe CxC 30.302,40 / Haber Ventas 25.680,00 / Haber ITBIS 4.622,40',
      JSON.stringify(pr8a) === JSON.stringify([
        { accountId: 'CXC', debit: 30302.4, credit: 0 },
        { accountId: 'VENTAS', debit: 0, credit: 25680 },
        { accountId: 'ITBIS', debit: 0, credit: 4622.4 },
      ]), JSON.stringify(pr8a));
  }

  console.log('\n3) Se niega cuando deshacer no es seguro\n');
  {
    const limpio = { status: 'rejected', cobrosAplicados: 0, conducesVigentes: 0, movimientosDeCaja: 0, movimientosDeInventario: 0, asientosDeEmision: 1, asientosTotales: 1 };
    const m = baja?.motivoParaNoDarDeBaja;
    ok('un rechazado limpio se puede dar de baja', !!m && m(limpio) === null);
    ok('uno rechazado AL EMITIR (sin asiento) tambien', !!m && m({ ...limpio, asientosDeEmision: 0, asientosTotales: 0 }) === null);
    const negativas: Array<[string, Partial<typeof limpio>]> = [
      ['submitted: puede estar en la DGII', { status: 'submitted' }],
      ['accepted', { status: 'accepted' }],
      ['void: ya dado de baja', { status: 'void' }],
      ['cobros aplicados', { cobrosAplicados: 1 }],
      ['conduces vigentes', { conducesVigentes: 1 }],
      ['movimientos de caja', { movimientosDeCaja: 1 }],
      ['movimientos de inventario', { movimientosDeInventario: 2 }],
      ['dos asientos de emision', { asientosDeEmision: 2, asientosTotales: 2 }],
      ['otro asiento ademas del de emision', { asientosTotales: 2 }],
    ];
    for (const [nombre, cambio] of negativas) {
      ok(`se niega: ${nombre}`, !!m && typeof m({ ...limpio, ...cambio }) === 'string');
    }
  }

  console.log('\n4) La CxC de la factura modificada se RECALCULA\n');
  {
    const s = baja?.saldoCxcTrasBaja;
    // E340000000002 y E340000000003 acreditan entera la misma factura. Dar de
    // baja la 0002 no puede dejar deuda: la 0003 sigue valiendo.
    ok('baja de una nota duplicada: la factura sigue en cero', !!s && s({ monto: 30302.4, aplicado: 0, otrasNotas: 30302.4 }) === 0);
    ok('baja de la unica nota: vuelve la deuda entera', !!s && s({ monto: 30302.4, aplicado: 0, otrasNotas: 0 }) === 30302.4);
    ok('con cobros aplicados y otra nota parcial', !!s && s({ monto: 1000, aplicado: 300, otrasNotas: 200 }) === 500);
    ok('nunca negativo', !!s && s({ monto: 100, aplicado: 80, otrasNotas: 50 }) === 0);
  }

  console.log('\n5) El cableado\n');
  {
    const svc = baja ? fuente('src/services/invoice/bajaDeRechazado.ts') : '';
    //  Anclado en la llave del CUERPO: la primera llave tras el nombre es la del
    //  tipo del parametro `p: { ... }`, y con ella el "cuerpo" eran cuatro campos.
    const cuerpo = bloque(svc, '): Promise<ResultadoBaja> {');
    const iBloqueo = cuerpo.indexOf(".for('update')");
    const iMotivo = cuerpo.indexOf('motivoParaNoDarDeBaja(estado)');
    ok('bloquea la fila ANTES de decidir', iBloqueo > 0 && iMotivo > iBloqueo);
    ok('niega con un error propio si hay motivo', /if \(motivo\) throw new BajaNoPermitidaError\(motivo\);/.test(cuerpo));
    ok('el contrario sale del reparto compartido, en sentido de baja',
      /lineasDeVenta\(await resolverCuentasDeVenta\(tx, p\.companyId, importes\), importes, true\)/.test(cuerpo)
      && /AccountRepository\.createJournalEntry\(tx, \{/.test(cuerpo));
    ok('NO espeja el asiento original (tocaria cuentas de agrupacion)',
      cuerpo.length > 0 && !/revertirAsientoContable/.test(cuerpo));
    ok('comprueba que el contrario mueve lo mismo que la emision', /Math\.abs\(Number\(original\?\.debe \?\? 0\) - debeContrario\) > 0\.01/.test(cuerpo));
    ok('deja el comprobante en void', /\.set\(\{ status: 'void', updatedAt: new Date\(\) \}\)/.test(cuerpo));
    ok('retira la CxC propia sin borrarla', /\.set\(\{ deletedAt: new Date\(\), updatedAt: new Date\(\) \}\)/.test(cuerpo));
    ok('recalcula la de la factura modificada', /saldoCxcTrasBaja\(\{/.test(cuerpo));
    ok('contramovimiento en el estado de cuenta del cliente', /movementType: 'void',/.test(cuerpo) && /debit: Number\(m\.credit\),\s*credit: Number\(m\.debit\),/.test(cuerpo));
    ok('deja rastro en auditoria', /action: 'comprobante_rechazado_dado_de_baja'/.test(cuerpo));

    // NADIE lo llama solo. Negacion: vale solo si el servicio existe.
    const automaticos = [
      'src/services/dgii/sincronizarPendientes.ts', 'src/infrastructure/jobRunners.ts',
      'src/app/api/v1/ecf/[id]/dgii-status/route.ts', 'src/app/api/v1/ecf/dgii-status/batch/route.ts',
      'src/services/dgii/perseguirVeredicto.ts', 'src/services/invoice/invoiceDbBooker.ts',
    ];
    ok('ningun camino automatico da de baja (decision del dueño)',
      !!baja && automaticos.every((f) => !/darDeBajaRechazado/.test(fuente(f))));

    let ruta = '';
    try { ruta = fuente('src/app/api/v1/ecf/[id]/dar-de-baja/route.ts'); } catch { ruta = ''; }
    ok('la ruta exige permiso de escritura en facturacion',
      /await enforcePermission\(auth\.userId, auth\.role, auth\.roleId, auth\.companyId, 'facturacion', 'write'\);/.test(ruta));
    ok('y da de baja en la empresa y el modo de la sesion',
      /darDeBajaRechazado\(\{\s*invoiceId: id,\s*companyId: auth\.companyId,\s*modo: auth\.modo,\s*userId: auth\.userId,\s*\}\)/.test(ruta));
    ok('la negativa sale como tal, no como error 500',
      /if \(error instanceof BajaNoPermitidaError\)/.test(ruta) && /\{ status: error\.status, headers: resHeaders \}/.test(ruta));

    const pantalla = fuente('src/app/dashboard/ecf/page.tsx');
    const manejador = bloque(pantalla, 'const handleDarDeBaja = async (inv: Invoice) =>');
    ok('el boton sale solo en los rechazados', /\{inv\.status === 'rejected' && \(\s*<button title="Dar de baja[^"]*" onClick=\{\(\) => handleDarDeBaja\(inv\)\}/.test(pantalla));
    ok('pide confirmacion ANTES de llamar a la ruta',
      manejador.indexOf('await confirm(') >= 0 && manejador.indexOf('if (!confirmado) return;') > manejador.indexOf('await confirm(')
      && manejador.indexOf('/dar-de-baja') > manejador.indexOf('if (!confirmado) return;'));
    ok('y avisa de que despues no se podra reenviar', /ya no se podrá reenviar/.test(pantalla));

    ok('ventas contra compras no cuenta un comprobante en void',
      /\$\{invoices\.status\} NOT IN \('rejected', 'void'\)/.test(fuente('src/repositories/reportRepository.ts')));
    ok('la reconstruccion del estado de cuenta no lo resucita',
      /\$\{invoices\.status\} NOT IN \('draft', 'rejected', 'void'\)/.test(fuente('src/services/financialMovementService.ts')));
  }

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(2); });
