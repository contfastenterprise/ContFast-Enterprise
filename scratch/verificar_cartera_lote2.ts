/**
 * Cartera, lote 2: la pantalla.
 *
 * El lote 1 puso los numeros; este los enseña. Lo que este banco defiende no es
 * que "se parezca al diseño" -- eso se juzga mirandolo -- sino las decisiones
 * que, si se caen, hacen que la pantalla mienta sin que se note:
 *
 *   - CAMBIAR DE PESTAÑA VACIA ANTES DE PEDIR. Si no, mientras carga suplidores
 *     sigues viendo clientes bajo el rotulo de suplidores. Es el mismo error que
 *     P2-37 pero durante la carga: datos viejos presentados como los de ahora.
 *
 *   - EL CUPO NO SE FINGE. Los suplidores no lo tienen en la base. La tarjeta
 *     desaparece y en el CSV va la celda VACIA, no un 0 que se leeria como
 *     "cupo agotado".
 *
 *   - LA MEDIA SOLO PROMEDIA LO QUE EXISTE. Una variacion `null` significa "el
 *     mes anterior fue cero, no hay contra que comparar". Contarla como 0
 *     arrastraria la media hacia abajo como si alguien hubiera caido.
 *
 *   - LA GRAFICA DICE QUE ENSEÑA. En el proyecto original era un "rendimiento"
 *     que no era nada. Aqui es facturacion mensual, y se llama asi.
 *
 *   - Y EL PANEL ES PARA MIRAR. Cobrar y pagar siguen en su pantalla: dos
 *     sitios que operan sobre lo mismo son dos sitios que pueden discrepar.
 */
import { fuente as fuenteCruda, crudo as crudoCrudo, bloque } from './_fuente';

const f = (r: string): string => fuenteCruda(r).replace(/\r\n/g, '\n');
const c = (r: string): string => crudoCrudo(r).replace(/\r\n/g, '\n');

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}

const PAGINA = 'src/app/dashboard/antiguedad-saldos/page.tsx';
const TABLA = 'src/components/cartera/TablaCartera.tsx';
const MODAL = 'src/components/cartera/ModalEstadoCuenta.tsx';
const TARJETAS = 'src/components/cartera/TarjetasResumen.tsx';
const GRAFICA = 'src/components/cartera/GraficaRendimiento.tsx';
const TIPOS = 'src/components/cartera/tipos.ts';

// ─── el nombre de la ruta ───────────────────────────────────────────────
{
  // "Cartera" es como se llama en la conversacion; "Antiguedad de Saldos" es
  // como se llama en contabilidad, y es exactamente lo que hace la pantalla:
  // clasificar lo pendiente por los dias transcurridos desde el vencimiento.
  const p = f(PAGINA);
  ok('la pantalla vive en su ruta contable y se presenta con ese nombre',
    c(PAGINA).includes('Antigüedad de Saldos —')
    && p.includes('export default function CarteraPage()'));

  ok('el subtitulo dice que clasifica, no un rotulo vacio',
    c(PAGINA).includes('Saldos pendientes clasificados por días transcurridos desde el vencimiento'));
}

// ─── las dos pestañas ───────────────────────────────────────────────────
{
  const p = f(PAGINA);

  // Las pestañas ya no se pintan las dos siempre: se filtran por permiso (ver
  // verificar_cartera_lote3.ts). La comprobacion se APRIETA en vez de
  // aflojarse -- ahora exige que exista el filtro, no solo el map.
  ok('hay dos pestañas, filtradas por permiso, y el rotulo cambia con la que veas',
    p.includes("(['clientes', 'suplidores'] as TipoCartera[])")
    && p.includes(".filter((t) => (t === 'clientes' ? puedeClientes : puedeSuplidores))")
    && p.includes(".map((t) => (")
    && p.includes("role=\"tab\"")
    && p.includes("tipo === 'clientes' ? 'Clientes' : 'Suplidores'"));

  // La importante: si no vacia, mientras carga suplidores sigues viendo
  // clientes bajo el rotulo equivocado.
  // Entre el vaciado y la carga entro el freno de permisos: no se pide lo que
  // se sabe que da 403. Lo que este banco defiende sigue siendo lo mismo --
  // que se VACIE antes de pedir --, asi que se comprueba el ORDEN, no un
  // bloque literal que cualquier linea nueva rompe.
  ok('al cambiar de pestaña se VACIA antes de pedir',
    (() => {
      const i = p.indexOf('setFilas([]);\n    setNivel(null);\n    setDetalle(null);');
      const j = p.indexOf('cargar(tipo);\n  }, [tipo, cargar');
      return i !== -1 && j !== -1 && i < j;
    })());

  ok('las palabras cambian con la pestaña: no se llama "por cobrar" a lo que debes',
    f(TIPOS).includes("totalTitulo: 'Cartera por Cobrar',")
    && f(TIPOS).includes("totalTitulo: 'Cuentas por Pagar',")
    && f(TIPOS).includes("totalPie: 'Total que debes',"));
}

// ─── carga y fallo ──────────────────────────────────────────────────────
{
  const p = f(PAGINA);

  ok('el esqueleto tiene la forma de lo que viene, y no se lee en voz alta',
    p.includes('function EsqueletoCartera()')
    && p.includes('data-esqueleto-cartera')
    && p.includes('aria-busy="true"')
    && p.includes('aria-hidden="true"')
    && p.includes('animate-pulse'));

  ok('un fallo de carga vacia, deja rastro y NO se confunde con "no hay nada"',
    p.includes('setFilas([]);\n        setErrorCarga(motivoDeCarga(null, data?.error?.message));')
    && p.includes('setErrorCarga(motivoDeCarga(err));')
    && p.includes('<ErrorDeCarga mensaje={errorCarga} onReintentar={() => cargar(tipo)} />'));

  // La carga vive fuera del efecto: si no, reintentar no reintentaria.
  ok('reintentar REINTENTA (la carga es una funcion, no el cuerpo del efecto)',
    p.includes('const cargar = useCallback(async (cual: TipoCartera) => {')
    && p.includes('onReintentar={() => cargar(tipo)}'));
}

// ─── lo que no se sabe, no se inventa ───────────────────────────────────
{
  const t = f(TARJETAS);
  const tab = f(TABLA);
  const p = f(PAGINA);

  ok('el cupo desaparece en suplidores en vez de enseñar un cero',
    t.includes('const hayCupo = filas.some((f) => f.cupoCredito !== null);')
    && t.includes('{hayCupo ? `Cupo total:')
    && tab.includes('{f.cupoCredito !== null && ('));

  ok('y en el CSV la celda va vacia, no a cero',
    p.includes("f.cupoCredito === null ? '' : f.cupoCredito.toFixed(2),"));

  ok('la media solo promedia las variaciones que existen',
    t.includes('.filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v));')
    && t.includes('const media = conVariacion.length > 0')
    && t.includes(': null;'));

  ok('sin nada que promediar se enseña una raya, no un cero',
    t.includes('{media === null ? (') && t.includes("'Sin meses comparables todavía'"));

  ok('una variacion inexistente se pinta como raya y se explica al pasar el raton',
    f(GRAFICA).includes("{ultima === null ? '—' :")
    && c(GRAFICA).includes('Sin comparación: el mes anterior no tuvo movimiento'));
}

// ─── el riesgo, solo con su icono ───────────────────────────────────────
{
  const tab = f(TABLA);
  const ley = f('src/components/cartera/LeyendaRiesgo.tsx');
  const ico = f('src/components/cartera/iconosRiesgo.tsx');

  // Un dibujo en dos sitios es dos dibujos el dia que alguien cambie uno. Y si
  // la tabla enseña un icono y la leyenda otro, la leyenda deja de explicar la
  // tabla, que es su unico trabajo.
  ok('el icono de cada nivel se dibuja en un solo sitio',
    ico.includes('export function IconoRiesgo({')
    && tab.includes("import { IconoRiesgo } from './iconosRiesgo';")
    && ley.includes("import { IconoRiesgo } from './iconosRiesgo';")
    && !ley.includes('const ICONO: Record<NivelRiesgo, React.ReactNode>'));

  ok('en la tabla el riesgo es SOLO el icono, sin la insignia de texto',
    tab.includes('<IconoRiesgo nivel={f.nivelRiesgo}')
    && !tab.includes('{r.etiquetaCorta}'));

  // Un icono solo no se explica: sin esto, quien no se sepa la leyenda de
  // memoria no sabe si el escudo es bueno o malo -- y quien no lo ve, menos.
  ok('el icono lleva dentro su nombre y su criterio, para el raton y para quien no lo ve',
    ico.includes('const texto = `${cfg.etiqueta} — ${cfg.criterio}`;')
    && ico.includes('aria-label={texto}')
    && ico.includes('title={texto}'));
}

// ─── que enseña la grafica, dicho con palabras ──────────────────────────
{
  ok('la grafica se llama facturacion mensual, que es lo que es',
    f(TABLA).includes('<th className="py-3 px-4">Facturación Mensual</th>')
    && !f(TABLA).includes('Rendimiento Mensual'));
}

// ─── panel de consulta, no de operacion ─────────────────────────────────
{
  const tab = f(TABLA);
  ok('la tabla lleva a la pantalla operativa en vez de duplicar la operacion',
    tab.includes('href={P.rutaOperativa}')
    && f(TIPOS).includes("rutaOperativa: '/dashboard/receivables',")
    && f(TIPOS).includes("rutaOperativa: '/dashboard/ap',")
    && !tab.includes('Nuevo Cliente'));
}

// ─── el estado de cuenta ────────────────────────────────────────────────
{
  const m = f(MODAL);

  ok('el modal pide SU detalle, y no arrastra toda la cartera para enseñar uno',
    m.includes('await fetch(`/api/v1/cartera/${fila.id}?tipo=${tipo}`)'));

  ok('un fallo del detalle no se lee como "sin documentos pendientes"',
    m.includes('setDocumentos([]);\n        setErrorCarga(motivoDeCarga(null, data?.error?.message));')
    && m.includes('<ErrorDeCarga mensaje={errorCarga} onReintentar={cargar} />')
    && m.includes('errorCarga ? ('));

  ok('se cierra con Escape: un modal solo-raton atrapa a quien usa teclado',
    m.includes("if (e.key === 'Escape') onCerrar();")
    && m.includes("window.addEventListener('keydown', alPulsar)")
    && m.includes("window.removeEventListener('keydown', alPulsar)"));

  ok('el pie recuerda donde se opera de verdad',
    c(MODAL).includes('Este panel es para consultar.'));
}

// ─── el CSV ─────────────────────────────────────────────────────────────
{
  const p = f(PAGINA);
  ok('el CSV escapa las comillas y lleva BOM (sin el, Excel rompe las tildes)',
    p.includes(`.replace(/"/g, '""')`)
    && p.includes("new Blob(['\ufeff' + cabecera + cuerpo]"));

  ok('exportar sin datos avisa en vez de bajar un fichero vacio',
    p.includes("toast.error('No hay nada que exportar todavía.');"));
}

// ─── el aviso de los 30 dias de credito ─────────────────────────────────
{
  const t = f(TIPOS);

  // Una sola constante para los dos sitios. Si la pantalla y el papel dijeran
  // cosas distintas sobre cuando empieza a contar el riesgo, habria dos reglas
  // y ninguna seria de fiar.
  ok('el plazo de credito se escribe UNA vez y se usa en los dos sitios',
    t.includes('export const DIAS_CREDITO = 30;')
    && t.includes('export const AVISO_CREDITO =')
    && f(PAGINA).includes('{AVISO_CREDITO}')
    && f(MODAL).includes('{AVISO_CREDITO}'));

  ok('el aviso dice desde cuando cuenta el riesgo, no solo el plazo',
    c(TIPOS).includes('Los niveles de riesgo empiezan a contarse cuando ese ')
    && c(TIPOS).includes('aparece como riesgo bajo, y eso es correcto.'));

  // Arriba y siempre: un cliente que debe mucho y sale en verde no se entiende
  // sin esto, y esa confusion es la que hace que se deje de mirar la pantalla.
  ok('el aviso se ve sin tener que bajar ni pasar el raton por nada',
    f(PAGINA).includes('data-aviso-credito'));
}

// ─── la palabra que no se usa aqui ──────────────────────────────────────
{
  const PANTALLAS = [
    PAGINA, TABLA, MODAL, TARJETAS, GRAFICA, TIPOS,
    'src/components/cartera/LeyendaRiesgo.tsx',
    'src/components/cartera/GraficaDonaRiesgo.tsx',
    'src/services/cartera/riesgo.ts',
  ];
  const conLaPalabra = PANTALLAS.filter((r) => /mora/i.test(c(r)));

  ok('en esta pantalla no se habla de mora: se habla de días de atraso',
    conLaPalabra.length === 0);
  if (conLaPalabra.length > 0) console.log('        la llevan:', conLaPalabra.join(', '));
}

// ─── el estado de cuenta: partidas abiertas por NCF ─────────────────────
{
  const repo = f('src/repositories/carteraRepository.ts');
  const ruta = f('src/app/api/v1/cartera/[id]/print/route.ts');
  const plantilla = f('src/utils/templates/documentTemplates.ts');
  const imp = f('src/components/cartera/estadoImpreso.ts');
  const tab = f(TABLA);
  const m = f(MODAL);

  // Un recibo no tiene renglon propio: aparece rebajando la factura a la que se
  // aplico. Y lo saldado no sale -- una factura cobrada es historia, no un
  // estado de cuenta.
  ok('solo salen las partidas que siguen debiendo, agrupadas por factura',
    repo.includes('static async estadoPorNcf(')
    && repo.includes('.filter((g) => g.saldo > 0.01 && g._origenPuesto)')
    && repo.includes('.filter((p) => p.saldo > 0.01)'));

  // La nota de credito NO tiene cuenta por cobrar propia: solo rebaja el
  // balance, asi que su importe hay que ir a buscarlo a la factura e-34.
  ok('la nota de credito se busca donde de verdad esta: en la factura e-34',
    repo.includes("eq(invoices.ecfType, '34'),")
    && repo.includes('inArray(invoices.modifiedInvoiceId, facturaIds)')
    && repo.includes('const ncPorFactura = new Map('));

  // La nota de debito SI crea su cuenta: si se dejara suelta, el cliente veria
  // dos lineas para una sola venta.
  ok('la nota de debito cuelga de la factura que corrige, no va suelta',
    repo.includes("const esNotaDebito = c.ecfType === '33' && !!c.corrigeA;")
    && repo.includes('esFacturaConocida.has(c.corrigeA as string)')
    && repo.includes('g.notasDebito += monto;'));

  // Si su factura no esta en la cartera, NO se esconde: desaparecer de la suma
  // seria peor que salir marcada.
  ok('una nota de debito sin su factura sale marcada, no desaparece',
    repo.includes('g.huerfana = esNotaDebito;')
    && plantilla.includes('(N/D suelta)'));

  // Los abonos, en una consulta para todas las lineas. Con 40 facturas, la
  // diferencia entre 2 consultas y 41.
  ok('los abonos se traen de una vez, no uno por linea',
    repo.includes('inArray(customerReceiptApplied.arId, arIds)')
    && repo.includes('inArray(supplierPaymentApplied.apId, cuentas.map((c) => c.apId))')
    && !repo.includes('for (const c of cuentas) {\n      await'));

  // Del lado de compras no hay notas modeladas: no se inventan dos columnas
  // vacias para que las dos tablas se parezcan.
  ok('en suplidores no se fingen notas que el sistema no tiene',
    repo.includes('static async partidasSuplidor(')
    && repo.includes('notasDebito: 0,')
    && repo.includes('notasCredito: 0,'));

  // La igualdad se imprime al pie: quien recibe el papel tiene que poder
  // comprobarla sin fiarse de nadie.
  // "Fecha" a secas no dice cual: en una linea que ya lleva vencimiento, la otra
  // fecha solo puede ser la de emision, y asi se llama.
  //
  // Se mira SOLO dentro de este metodo: el fichero tiene treinta plantillas mas
  // y varias usan `<th>Fecha</th>` con toda la razon. Una negacion sobre el
  // fichero entero las habria acusado a ellas.
  {
    const metodo = bloque(plantilla, 'static renderEstadoPorNcf(');
    ok('la columna de la fecha dice cual es: emisión',
      metodo.includes('<th>Emisión</th>') && !metodo.includes('<th>Fecha</th>'));
  }

  ok('el papel explica como cuadra cada linea, y trae totales',
    plantilla.includes('static renderEstadoPorNcf(data: any): string {')
    && c('src/utils/templates/documentTemplates.ts').includes('Saldo = (Facturado + Notas de Débito) − Abonos − Notas de Crédito.')
    && plantilla.includes('<tfoot>'));

  ok('la ruta usa esa plantilla y ese calculo, y valida empresa y modo',
    ruta.includes('DocumentTemplates.renderEstadoPorNcf({')
    && /estadoPorNcf\(\s*session\.companyId,\s*session\.modo,/.test(ruta)
    && /datosEntidad\(session\.companyId, tipo, entidadId\)/.test(ruta)
    && ruta.includes(".uuid('La entidad no es válida.')")
    && ruta.includes('MODULO[tipo],'));

  // El aviso del plazo se escribe UNA vez: si el papel y la pantalla dijeran
  // cosas distintas sobre cuando empieza a contar el riesgo, ninguna valdria.
  ok('el papel repite el aviso del plazo, desde la misma frase que la pantalla',
    ruta.includes("import { AVISO_CREDITO } from '@/components/cartera/tipos';")
    && ruta.includes('aviso: AVISO_CREDITO,'));

  ok('sale un PDF compacto, con cabecera repetida y lineas sin partir',
    ruta.includes("PdfGenerator.generatePdfFromHtml(comprimir(html), 'carta')")
    && ruta.includes("'Content-Type': 'application/pdf',")
    && ruta.includes('thead { display: table-header-group; }')
    && ruta.includes('tr { page-break-inside: avoid; }'));

  ok('si el PDF falla, se devuelve el mismo documento y se DICE que fallo',
    ruta.includes('} catch (pdfErr: unknown) {')
    && c('src/app/api/v1/cartera/[id]/print/route.ts').includes('No se pudo generar el PDF.')
    && ruta.includes('@media print { .aviso-pdf { display: none !important; } }'));

  ok('la direccion se escribe una vez, y desde la fila es un enlace',
    imp.includes('`/api/v1/cartera/${id}/print?tipo=${tipo}`')
    && tab.includes('href={urlEstadoImpreso(tipo, f.id)}')
    && tab.includes('rel="noopener noreferrer"')
    && m.includes('const imprimir = () => abrirEstadoImpreso(tipo, fila.id);'));
}

console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLA(S)`);
process.exit(fallos === 0 ? 0 : 1);
