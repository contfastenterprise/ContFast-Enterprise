import { crudo as crudoCrudo } from './_fuente';

const crudo = (rutaRelativa: string): string => crudoCrudo(rutaRelativa).replace(/\r\n/g, '\n');

let fallos = 0;

function ok(t: string, c: boolean): void {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!c) fallos++;
}

// ═══════════════════ P2-29: MSellerClient.issueInvoice mock legacy ═══════════════════
// Metodo estatico sin ningun llamador real en todo el repo (invoiceService.ts tiene su
// PROPIO metodo issueInvoice, sin relacion) que devolvia un e-NCF y una firma FABRICADOS
// si alguna vez se llegaba a invocar. Se elimina junto con la interfaz
// MSellerInvoicePayload, que solo existia para el.

const P = 'src/services/dgii/msellerClient.ts';
const src = crudo(P);

ok('msellerClient: sin metodo mock issueInvoice()', !src.includes('static async issueInvoice('));
ok(
  'msellerClient: sin el mensaje de mock del e-NCF',
  !src.includes("dgiiMessage: 'Aceptado (MOCK - usa ECFPayload)',")
);
ok('msellerClient: sin el XML firmado fabricado', !src.includes("Buffer.from('<xml>Mock Signed XML</xml>')"));
ok('msellerClient: sin la interfaz MSellerInvoicePayload', !src.includes('interface MSellerInvoicePayload'));
ok(
  'msellerClient: la clase sigue cerrando limpio (downloadXml es el ultimo metodo)',
  src.trimEnd().endsWith('return await xmlRes.text();\n  }\n}')
);

console.log(`\nTotal fallos: ${fallos}`);
process.exit(fallos > 0 ? 1 : 0);
