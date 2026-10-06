/**
 * Lote 308: los tickets de Soporte van al buzon de soporte de ContFast,
 * `contfastenterprise@gmail.com`, y no al correo de la empresa.
 *
 * Decision del dueño (2026-10-05): *"los tickets de soporte deben de enviarse a
 * contfastenterprise@gmail.com"*. Desde el lote 288 iban al correo de Configuracion >
 * Empresa (`companies.email`) y, si la empresa no lo tenia, no salian (409).
 *
 * Se EJECUTA `enviarTicketDeSoporte` con el transporte sustituido (ningun correo de verdad):
 * con correo de empresa, sin el y con uno mal escrito, siempre a soporte. Y se mira la ruta
 * (sin 409) y el manual.
 *
 * Uso: npx tsx scratch/verificar_soporte_a_contfast.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

let fallos = 0;
let oks = 0;
const ok = (etiqueta: string, cond: boolean, detalle?: unknown) => {
  if (cond) { oks++; console.log(`  OK    ${etiqueta}`); }
  else { fallos++; console.log(`  FALLA ${etiqueta}${detalle !== undefined ? ` -> ${JSON.stringify(detalle)}` : ''}`); }
};
const raiz = resolve(__dirname, '..');
const leer = (rel: string) => readFileSync(resolve(raiz, rel), 'utf8');
const SOPORTE = 'contfastenterprise@gmail.com';
type AnyRec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function enviar(correoEmpresa: string | null) {
  const S = await import('../src/services/soporte/enviarTicketDeSoporte');
  const mandados: AnyRec[] = [];
  const registrados: AnyRec[] = [];
  const r = await S.enviarTicketDeSoporte(
    { subject: 'No sale la factura', category: 'billing', message: 'Al emitir sale un error de prueba.' },
    { userId: 'u-1', companyId: 'c-1', modo: 'PRUEBA' },
    {
      mandar: async (m) => { mandados.push(m); return { messageId: '<x@smtp>' }; },
      registrar: async (f) => { registrados.push(f); },
      //  `correoEmpresa` ya no es parte del tipo; se pasa igual para ver que no se usa.
      quienEscribe: async () => ({ nombre: 'Ana', correo: 'ana@latindoors.test', empresa: 'Latin Doors', correoEmpresa } as never),
      remitente: () => '"ContFast Soporte" <no-reply@contfast.test>',
      ahora: () => new Date('2026-10-05T15:00:00Z'),
      bytes: () => new Uint8Array([1, 2, 3, 4, 5, 6]),
    },
  );
  return { r: r as AnyRec, mandados, registrados };
}

async function main() {
  console.log('\n1) El destino (ejecutado)\n');
  {
    const { r, mandados, registrados } = await enviar('ventas@latindoors.test');
    ok('con correo de empresa, el ticket va a contfastenterprise@gmail.com y no a la empresa',
      r.enviado === true && mandados.length === 1 && mandados[0].to === SOPORTE, mandados[0]?.to);
    ok('el registro de correos apunta el destino de soporte', registrados[0]?.toEmail === SOPORTE, registrados[0]?.toEmail);
    ok('la respuesta sigue llegando al usuario (Reply-To)', mandados[0]?.to === SOPORTE && mandados[0]?.replyTo === 'ana@latindoors.test');
  }
  {
    const { r, mandados } = await enviar(null);
    ok('sin correo de empresa el ticket SALE igual, a soporte (antes: 409 y nada)',
      r.enviado === true && mandados.length === 1 && mandados[0].to === SOPORTE, r);
  }
  {
    const { r, mandados } = await enviar('ventas arroba latindoors');
    ok('con el correo de empresa mal escrito, tambien sale a soporte', r.enviado === true && mandados[0]?.to === SOPORTE, r);
  }

  console.log('\n2) La ruta y las reglas\n');
  const ruta = leer('src/app/api/v1/support/tickets/route.ts');
  const reglas = leer('src/services/soporte/ticketDeSoporte.ts');
  ok('el destino es una constante con el buzon de soporte',
    /export const CORREO_DE_SOPORTE = 'contfastenterprise@gmail\.com';/.test(reglas));
  ok('la ruta ya no contesta 409 por falta de correo de empresa',
    /\{ status: 502 \}/.test(ruta) && !/SIN_CORREO_DE_EMPRESA/.test(ruta));
  ok('y el mensaje "Tu empresa no tiene un correo configurado" ya no existe',
    /CORREO_DE_SOPORTE/.test(reglas) && !/Tu empresa no tiene un correo configurado/.test(reglas));

  console.log('\n3) El manual\n');
  const m = leer('scripts/generate-manual.js');
  ok('el manual dice que el ticket va al equipo de soporte de ContFast, con su correo',
    /al equipo de soporte de ContFast<\/strong> \(contfastenterprise@gmail\.com\)/.test(m));
  ok('y ya no dice que va al correo de la empresa ni avisa de la empresa sin correo',
    /equipo de soporte de ContFast/.test(m) && !/al correo de la empresa<\/strong>/.test(m)
    && !/Tu empresa no tiene un correo configurado/.test(m) && !/llegan los tickets de Soporte/.test(m));
  const ver = Number((m.match(/const VERSION = '(\d+\.\d+)';/) ?? [])[1]);
  ok('la version del manual es la 3.7 o posterior', ver >= 3.7, ver);

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLA(S)`} — ${oks} OK\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
