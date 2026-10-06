/**
 * Lote 309: en el correo del ticket de Soporte, el remitente dice QUIEN escribe.
 *
 * Decision del dueño (2026-10-06): *"cuando se envia el ticket de soporte, en usuario debe
 * aparecer el correo del usuario, no de ContFast"*. Medido antes (PRODUCCION, solo lectura,
 * `scratch/_to_delete/medir_soporte_309.ts`): el ticket SOP-3HEUZP lo mando "Gerson Gonzalez M",
 * cuya cuenta tiene el correo contfastenterprise@gmail.com, y el "De" era "ContFast Soporte
 * <contfastenterprise@gmail.com>" -- el mismo buzon que lo recibe. Preguntado, el dueño eligio
 * que el remitente lleve al usuario.
 *
 * La DIRECCION del From sigue siendo la del sistema (Gmail no deja enviar como otra, y un From
 * ajeno sin firmar acaba en spam); lo que cambia es el NOMBRE visible: "<nombre> (<correo>) via
 * ContFast". Se EJECUTA `enviarTicketDeSoporte` con el transporte sustituido.
 *
 * Uso: npx tsx scratch/verificar_remitente_del_ticket.ts
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
type AnyRec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function enviar(nombre: string, correo: string, remitente = '"ContFast Soporte" <no-reply@contfast.test>') {
  const S = await import('../src/services/soporte/enviarTicketDeSoporte');
  const mandados: AnyRec[] = [];
  await S.enviarTicketDeSoporte(
    { subject: 'No sale la factura', category: 'billing', message: 'Al emitir sale un error de prueba.' },
    { userId: 'u-1', companyId: 'c-1', modo: 'PRUEBA' },
    {
      mandar: async (m) => { mandados.push(m as AnyRec); return { messageId: '<x@smtp>' }; },
      registrar: async () => {},
      quienEscribe: async () => ({ nombre, correo, empresa: 'Latin Doors' }),
      remitente: () => remitente,
      ahora: () => new Date('2026-10-06T15:00:00Z'),
      bytes: () => new Uint8Array([1, 2, 3, 4, 5, 6]),
    },
  );
  const from = mandados[0]?.from;
  //  El nombre visible tal como lo veria la bandeja, sea objeto o texto.
  const nombreVisible = typeof from === 'object' && from ? String(from.name) : String(from ?? '').replace(/\s*<[^>]*>\s*$/, '').replace(/"/g, '');
  const direccion = typeof from === 'object' && from ? String(from.address) : (String(from ?? '').match(/<([^>]+)>/) ?? [])[1];
  return { m: mandados[0] ?? {}, nombreVisible, direccion };
}

async function main() {
  console.log('\n1) El remitente (ejecutado)\n');
  {
    const { m, nombreVisible, direccion } = await enviar('Ana Pérez', 'ana@latindoors.test');
    ok('el nombre del remitente es el del usuario con su correo, "vía ContFast"',
      nombreVisible === 'Ana Pérez (ana@latindoors.test) vía ContFast', nombreVisible);
    ok('y ya no dice "ContFast Soporte"', nombreVisible.includes('ana@latindoors.test') && !/ContFast Soporte/.test(nombreVisible));
    //  Invariantes: ciertas antes y despues del lote (la direccion y el Reply-To no cambian).
    const inv = (t: string, c: boolean, d?: unknown) => {
      if (c) console.log(`  inv   ${t}`); else { fallos++; console.log(`  INV   ${t} -> ${JSON.stringify(d)}`); }
    };
    inv('la direccion de envio sigue siendo la del sistema (no la del usuario)', direccion === 'no-reply@contfast.test', direccion);
    inv('responder sigue yendo al usuario', m.replyTo === 'ana@latindoors.test', m.replyTo);
  }
  {
    const { direccion } = await enviar('Ana', 'ana@latindoors.test', 'soporte@contfast.test');
    ok('con un remitente del sistema sin nombre, la direccion se toma entera', direccion === 'soporte@contfast.test', direccion);
  }
  {
    const { nombreVisible } = await enviar('Ana "la jefa" <x>\r\nBcc: otro@malo.test', 'ana@latindoors.test');
    ok('comillas, angulos y saltos de linea no pasan al nombre (no se inyecta una cabecera)',
      nombreVisible.includes('ana@latindoors.test') && !/["<>\r\n]/.test(nombreVisible), nombreVisible);
  }
  {
    const { nombreVisible } = await enviar('Ana', 'esto no es un correo');
    ok('sin un correo valido, el nombre va solo', nombreVisible === 'Ana vía ContFast', nombreVisible);
  }
  {
    const { nombreVisible } = await enviar('', 'ana@latindoors.test');
    ok('sin nombre, va el correo', nombreVisible === 'ana@latindoors.test vía ContFast', nombreVisible);
  }

  console.log('\n2) El manual\n');
  const man = readFileSync(resolve(raiz, 'scripts/generate-manual.js'), 'utf8');
  ok('el manual dice que el remitente lleva el nombre y el correo de quien escribe',
    /el remitente dice su nombre y su correo \(«… vía ContFast»\)/.test(man));
  const ver = Number((man.match(/const VERSION = '(\d+\.\d+)';/) ?? [])[1]);
  ok('la version del manual es la 3.8 o posterior', ver >= 3.8, ver);

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLA(S)`} — ${oks} OK\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
