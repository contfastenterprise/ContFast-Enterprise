/**
 * Ningun documento lleva impreso el nombre de otra empresa.
 *
 * EL FALLO
 * --------
 * Habia 22 sitios con la marca "Latin Doors" escrita a mano, y en 17 de ellos
 * como valor por defecto:
 *
 *     company?.name || 'Latin Doors SRL'
 *     company.companyName || 'Latin Doors e-CF'
 *
 * Lo que lo convierte en un fallo de aislamiento y no en un descuido es esto:
 * `companies.name` es NOT NULL. Comprobado contra el esquema. Asi que ese `||`
 * NUNCA cubria el caso "una empresa sin nombre" -- ese caso no existe. Solo
 * saltaba cuando la BUSQUEDA de la empresa fallaba (sesion rara, empresa
 * borrada, perfil no encontrado). Y entonces no imprimia un hueco: imprimia el
 * nombre de OTRA empresa.
 *
 * Donde salia impreso:
 *   - Descargo de prestaciones laborales: "Recibi a mi entera satisfaccion de
 *     la empresa <NOMBRE>, la suma descrita...", que es el texto que FIRMA un
 *     empleado al liquidarse.
 *   - Recibos de nomina y liquidaciones (cabecera del PDF).
 *   - Ordenes a suplidores (cabecera y bloque de firma).
 *   - Seis informes del dashboard.
 *
 * Ademas, las dos rutas de RRHH ponian `rnc: company?.rnc || 'N/A'`. Un
 * documento laboral con el emisor equivocado y RNC "N/A" no vale nada, y de
 * paso engana a quien lo firma.
 *
 * LA REGLA
 * --------
 * El nombre de la empresa no tiene sustituto.
 *
 *   - En los PDF (`CompanyInfo.name` ya era `string` NO opcional): se usa
 *     `company.name` y punto. El `?.` y el `||` defendian de algo que el tipo
 *     ya prohibe.
 *   - En las rutas de RRHH: si no hay empresa, NO se emite el documento (404).
 *     Es la unica respuesta honesta.
 *   - En los informes del dashboard, donde el dato viene de una API que puede
 *     devolver `companyName: null`, el sustituto es "Empresa sin identificar":
 *     hace VISIBLE el fallo en vez de disimularlo con una marca ajena.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { db } from '../src/db';
import { sql } from 'drizzle-orm';
import { fuente as codigo, crudo } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

const RAIZ = join(__dirname, '..');
// Fuera comentarios: los de arriba y los que quedaron en el codigo citan la
// marca a proposito, para explicar el fallo. Sin esto el banco se acusaria a
// si mismo -- y ese error ya se cometio antes en esta auditoria.

const PDF = 'src/services/pdfGenerator.ts';
const PLANTILLAS = 'src/utils/templates/documentTemplates.ts';
const LIQUIDACION = 'src/app/api/v1/hr/settlements/[id]/print/route.ts';
const NOMINA = 'src/app/api/v1/hr/payroll/[id]/receipts/route.ts';
const INFORMES = [
  'src/app/dashboard/customers/page.tsx',
  'src/app/dashboard/warehouses/page.tsx',
  'src/app/dashboard/inventory/movements/page.tsx',
  'src/app/dashboard/inventory/categories/page.tsx',
  'src/app/dashboard/products/page.tsx',
  'src/app/dashboard/suppliers/page.tsx',
];

async function main() {
  console.log('\n1) La premisa: `companies.name` es NOT NULL\n');

  // Si esto dejara de ser cierto, el arreglo cambia de forma: haria falta un
  // sustituto de verdad y no bastaria con quitar el `||`. Por eso se comprueba.
  const [fila] = (await db.execute(sql`
    SELECT is_nullable FROM information_schema.columns
     WHERE table_name = 'companies' AND column_name = 'name'`)) as unknown as { is_nullable: string }[];
  ok('companies.name NOT NULL -> "empresa sin nombre" no existe',
    fila?.is_nullable === 'NO', String(fila?.is_nullable));

  const [{ n: vacias }] = (await db.execute(sql`
    SELECT count(*)::int AS n FROM companies WHERE name IS NULL OR trim(name) = ''`)) as unknown as { n: number }[];
  ok('y no hay ninguna con el nombre en blanco', vacias === 0, String(vacias));

  console.log('\n2) Ningun fichero lleva la marca escrita a mano\n');

  const todos = [PDF, PLANTILLAS, LIQUIDACION, NOMINA, ...INFORMES,
                 'src/services/storefront/companyService.ts',
                 'src/app/dashboard/products/barcodes/page.tsx'];
  const conMarca = todos.filter(f => /Latin Doors/.test(codigo(f)));
  ok('cero apariciones en codigo (fuera comentarios)', conMarca.length === 0, conMarca.join(', '));

  console.log('\n3) Los PDF usan el nombre sin sustituto\n');

  ok('pdfGenerator no tiene `company?.name ||`', !/company\?\.name\s*\|\|/.test(codigo(PDF)));
  ok('pdfGenerator usa company.name', /company\.name/.test(codigo(PDF)));
  // La regla exacta no es "sin `||`" sino "sin INVENTAR un nombre". Un
  // `company.name || ''` deja el hueco vacio, que es honesto: no se ve nada.
  // Un `company.name || 'Loquesea'` pone una empresa que no es. El banco pillo
  // aqui un `|| 'ContFast Enterprise'` -- el nombre del producto impreso como
  // si fuera el de la empresa -- que se habia escapado por buscar solo la
  // marca "Latin Doors" en vez del patron.
  const inventados = [...codigo(PLANTILLAS).matchAll(/company\.name\s*\|\|\s*'([^']*)'/g)]
    .map(m => m[1]).filter(v => v.trim() !== '');
  ok('las plantillas no inventan ningun nombre de empresa', inventados.length === 0,
    inventados.join(', '));

  const inventadosPdf = [...codigo(PDF).matchAll(/company\??\.name\s*\|\|\s*'([^']*)'/g)]
    .map(m => m[1]).filter(v => v.trim() !== '');
  ok('los PDF tampoco', inventadosPdf.length === 0, inventadosPdf.join(', '));

  // El descargo que firma el empleado es el peor sitio donde puede salir un
  // nombre ajeno: se comprueba aparte.
  const descargo = codigo(PDF).match(/Recib[ií] a mi entera satisfacci[oó]n[^`]*/);
  ok('el descargo de prestaciones existe y no lleva sustituto',
    !!descargo && !/\|\|/.test(descargo[0]),
    descargo ? descargo[0].slice(0, 70) + '...' : 'no encontrado');

  console.log('\n4) Sin empresa, los documentos laborales NO se emiten\n');

  for (const [nombre, ruta] of [['liquidaciones', LIQUIDACION], ['nomina', NOMINA]] as const) {
    const src = codigo(ruta);
    ok(`${nombre}: hay guarda \`if (!company)\``, /if\s*\(!company\)/.test(src));
    ok(`${nombre}: responde 404`, /status:\s*404/.test(src));
    ok(`${nombre}: el nombre va sin sustituto`, !/company\?\.name\s*\|\|/.test(src));
    ok(`${nombre}: el RNC ya no cae en "N\\/A"`, !/rnc:\s*company\?\.rnc\s*\|\|\s*'N\/A'/.test(src));
    // La guarda tiene que ir ANTES de construir el bloque de la empresa; si
    // fuera despues, no serviria de nada.
    const iGuarda = src.indexOf('if (!company)');
    const iUso = src.indexOf('name: company.name');
    ok(`${nombre}: la guarda va ANTES de usar los datos`,
      iGuarda !== -1 && iUso !== -1 && iGuarda < iUso, `guarda@${iGuarda} uso@${iUso}`);
  }

  console.log('\n5) Los informes hacen visible el fallo, no lo disimulan\n');

  for (const f of INFORMES) {
    const src = codigo(f);
    ok(`${f.split('/').slice(-2).join('/')}: sustituto neutro`,
      /companyName \|\| 'Empresa sin identificar'/.test(src) && !/Latin Doors/.test(src));
  }

  console.log('\n6) Barrido de TODO src/: ninguna identidad de empresa inventada\n');

  // Este barrido es el que de verdad cierra el punto. Los apartados de arriba
  // miran ficheros concretos; este recorre el arbol entero, porque buscar por
  // la marca "Latin Doors" en vez de por el PATRON fue justo el error que dejo
  // escapar un `|| 'ContFast Enterprise'` y otros ocho sitios.
  const ACEPTABLES = new Set([
    'Empresa sin identificar',  // dice que falta, no suplanta a nadie
    'Tienda en Línea',          // titulo de la tienda publica, no documento fiscal
    'nuestra tienda',
  ]);

  const inventadosGlobal: string[] = [];
  const recorrer = (dir: string) => {
    for (const e of readdirSync(dir)) {
      if (e === 'node_modules' || e === '.next') continue;
      const abs = join(dir, e);
      if (statSync(abs).isDirectory()) { recorrer(abs); continue; }
      if (!/\.(ts|tsx)$/.test(e)) continue;
      const rel = abs.slice(RAIZ.length + 1);
      for (const m of codigo(rel).matchAll(/company\??\.(?:name|companyName|rnc)\s*\|\|\s*'([^']+)'/g)) {
        if (!ACEPTABLES.has(m[1])) inventadosGlobal.push(`${rel}: '${m[1]}'`);
      }
    }
  };
  recorrer(join(RAIZ, 'src'));
  ok('cero nombres/RNC de empresa inventados en todo src/', inventadosGlobal.length === 0,
    inventadosGlobal.slice(0, 6).join(' | '));

  console.log('\n6b) Los dos sitios donde la identidad inventada era fiscal\n');

  // El arqueo de caja: NO se bloquea (frenar un cierre de caja seria peor),
  // pero '000000000' tiene forma de RNC valido y por eso nadie lo mira dos
  // veces. Va null y el ticket omite la linea.
  const ticket = codigo('src/app/api/v1/cash/sessions/[id]/ticket/route.ts');
  ok('ticket de caja: sin RNC fabricado', !/'000000000'/.test(ticket));
  ok('ticket de caja: el RNC va null, no inventado', /rnc:\s*company\?\.rnc\s*\?\?\s*null/.test(ticket));
  ok('ticket de caja: NO bloquea el cierre', !/status:\s*40\d/.test(ticket) || /console\.error/.test(ticket));
  ok('ticket de caja: deja constancia del fallo', /console\.error/.test(ticket));

  const comp = codigo('src/components/print/ThermalTicketPrint.tsx');
  ok('el ticket omite la linea del RNC si no hay', /company\.rnc\s*\?/.test(comp));

  // El correo al cliente: firmado por una empresa que no es la suya.
  const correo = codigo('src/app/api/v1/invoices/[id]/email/route.ts');
  ok('correo al cliente: guarda si no hay empresa', /if\s*\(!company\)/.test(correo));
  const gen = codigo('src/services/invoice/invoiceFileGenerator.ts');
  ok('aviso de factura: no se manda sin nombre de empresa', /!company\?\.name/.test(gen));
  ok('aviso de factura: y la factura SI se genera igual', /La factura y el PDF si se generaron/.test(crudo('src/services/invoice/invoiceFileGenerator.ts')));

  console.log('\n7) Control: el quita-comentarios hace su trabajo\n');

  // Si `codigo()` no quitara nada, el punto 2 fallaria por los comentarios que
  // explican el arreglo. Que el crudo SI tenga la marca lo demuestra.
  ok('el fuente CRUDO de las rutas de RRHH cita la marca (en comentarios)',
    /Latin Doors/.test(crudo(LIQUIDACION)));
  ok('y el limpio no', !/Latin Doors/.test(codigo(LIQUIDACION)));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
