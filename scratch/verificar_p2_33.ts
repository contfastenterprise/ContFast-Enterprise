import { crudo as crudoCrudo } from './_fuente';

// Normaliza CRLF -> LF antes de comparar.
const crudo = (rutaRelativa: string): string => crudoCrudo(rutaRelativa).replace(/\r\n/g, '\n');

let fallos = 0;

function ok(t: string, c: boolean): void {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!c) fallos++;
}

// bare confirm('...') o confirm(`...`) que NO sea "await confirm(" (nuestro hook)
function sinConfirmNativo(ruta: string): void {
  const src = crudo(ruta);
  const patron = /[^.]\bconfirm\(['`]/g;
  let n = 0;
  let m: RegExpExecArray | null;
  while ((m = patron.exec(src)) !== null) {
    const ventana = src.slice(Math.max(0, m.index - 6), m.index + 20);
    if (!ventana.includes('await confirm(')) n++;
  }
  ok(`${ruta}: sin confirm() nativo remanente (quedan ${n})`, n === 0);
}

// ═══════════════════ P2-33: window.confirm()/confirm() nativo -> useConfirm() ═══════════════════
// La auditoria encontro ~10 acciones criticas con confirm() bloqueante del navegador en vez
// del dialogo useConfirm() ya establecido en el resto de la app (10 paginas lo usaban ya).
// Se migran las 12 ocurrencias restantes en 8 archivos.

const ARCHIVOS_NUEVOS = [
  'src/app/dashboard/accounting/page.tsx',
  'src/app/dashboard/delivery-notes/page.tsx',
  'src/app/dashboard/hr/config/page.tsx',
  'src/app/dashboard/hr/departments/page.tsx',
  'src/app/dashboard/products/barcodes/page.tsx',
  'src/app/dashboard/purchases/orders/page.tsx',
] as const;

for (const p of ARCHIVOS_NUEVOS) {
  sinConfirmNativo(p);
  ok(`${p}: import useConfirm agregado`, crudo(p).includes("import { useConfirm } from '@/providers/confirm-provider';"));
  ok(`${p}: const confirm = useConfirm() declarado`, crudo(p).includes('const confirm = useConfirm();'));
}

sinConfirmNativo('src/app/dashboard/purchases/page.tsx');
// invoices/page.tsx nunca uso confirm() nativo (sin punto): usaba window.confirm(). El unico
// check discriminante para este archivo es la ausencia de window.confirm(.
ok(
  'src/app/dashboard/invoices/page.tsx: sin window.confirm( remanente',
  !crudo('src/app/dashboard/invoices/page.tsx').includes('window.confirm(')
);

// ─────────────────── comprobaciones especificas por sitio ───────────────────
{
  const src = crudo('src/app/dashboard/accounting/page.tsx');
  ok(
    'accounting: reabrir/cerrar periodo con useConfirm',
    src.includes("title: nextStatus === 'open' ? 'Reabrir período' : 'Cerrar período',") &&
      src.includes('await confirm({')
  );
}
{
  const src = crudo('src/app/dashboard/delivery-notes/page.tsx');
  ok('delivery-notes: aprobar conduce con useConfirm', src.includes("title: 'Aprobar conduce',"));
  ok(
    'delivery-notes: anular conduce con useConfirm (destructive)',
    src.includes("title: 'Anular conduce',") && src.includes("variant: 'destructive',")
  );
}
ok(
  'hr/config: restablecer valores con useConfirm',
  crudo('src/app/dashboard/hr/config/page.tsx').includes("title: 'Restablecer valores de fábrica',")
);
{
  const src = crudo('src/app/dashboard/hr/departments/page.tsx');
  ok('hr/departments: eliminar departamento con useConfirm', src.includes("title: 'Eliminar departamento',"));
  ok('hr/departments: eliminar puesto con useConfirm', src.includes("title: 'Eliminar puesto',"));
}
ok(
  'products/barcodes: autogenerar con useConfirm',
  crudo('src/app/dashboard/products/barcodes/page.tsx').includes("title: 'Autogenerar códigos de barra',")
);
{
  const src = crudo('src/app/dashboard/purchases/orders/page.tsx');
  ok('purchases/orders: enviar pedido con useConfirm', src.includes("title: 'Marcar como enviada',"));
  ok('purchases/orders: duplicar pedido con useConfirm', src.includes("title: 'Duplicar pedido',"));
  ok(
    'purchases/orders: cancelar pedido con useConfirm (destructive)',
    src.includes("title: 'Cancelar pedido',") && src.includes("variant: 'destructive',")
  );
}
ok(
  'purchases/page: aplicar cheque con useConfirm',
  crudo('src/app/dashboard/purchases/page.tsx').includes("title: 'Aplicar cheque contablemente',")
);
{
  const src = crudo('src/app/dashboard/invoices/page.tsx');
  ok(
    'invoices: fallback local con useConfirm en vez de window.confirm',
    src.includes("title: 'Error de comunicación con la DGII',") && src.includes('const proceed = await confirm({')
  );
}

console.log(`\nTotal fallos: ${fallos}`);
process.exit(fallos > 0 ? 1 : 0);
