import { existsSync } from 'fs';
import { crudo as crudoCrudo } from './_fuente';

const crudo = (rutaRelativa: string): string => crudoCrudo(rutaRelativa).replace(/\r\n/g, '\n');

let fallos = 0;

function ok(t: string, c: boolean): void {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!c) fallos++;
}

// ═══════════ P2-38 (piloto): partir purchases/page.tsx ═══════════
// Las 3 paginas grandes son UN solo componente cada una (46-65 useState, cero
// hijos): memo()/useCallback no tienen donde aplicarse, y el coste real -- que
// cualquier tecla re-renderice 2.000+ lineas -- es estructural. Piloto: sacar
// GuaranteeChecksView (ya era una funcion aparte dentro del mismo archivo) a su
// propio archivo, envuelto en memo. Sin props, solo se re-renderiza por su estado.
//
// De paso, un fallo de P2-33: `confirm(...)` dentro de ese componente no tenia
// ningun `confirm` en su ambito (el useConfirm() esta en PurchasesPage, OTRO
// componente) y caia al window.confirm global con un objeto como mensaje.

const PAGE = 'src/app/dashboard/purchases/page.tsx';
const COMP = 'src/app/dashboard/purchases/components/GuaranteeChecksView.tsx';
const UTIL = 'src/utils/fechasLocales.ts';

ok('existe components/GuaranteeChecksView.tsx', existsSync(COMP));
ok('existe utils/fechasLocales.ts', existsSync(UTIL));

{
  const c = existsSync(COMP) ? crudo(COMP) : '';
  ok('componente: es cliente', c.startsWith("'use client';\n"));
  ok('componente: importa memo', c.includes("import { memo, useState, useEffect } from 'react';"));
  ok('componente: importa useConfirm', c.includes("import { useConfirm } from '@/providers/confirm-provider';"));
  ok(
    'componente: importa las helpers de fecha desde utils',
    c.includes("import { getLocalDateString, getFirstDayOfMonthString, formatDateDisplay } from '@/utils/fechasLocales';")
  );
  ok(
    'componente: declara su PROPIO confirm (el fallo de P2-33)',
    c.includes('function GuaranteeChecksView() {\n  const confirm = useConfirm();\n')
  );
  ok(
    'componente: sigue usando el dialogo propio para aplicar el cheque',
    c.includes("title: 'Aplicar cheque contablemente',")
  );
  ok('componente: se exporta envuelto en memo', c.trimEnd().endsWith('export default memo(GuaranteeChecksView);'));
  ok(
    'componente: conserva la logica de cheques (pendientes sin fecha, aplicados por cleared)',
    c.includes('fetch(`/api/v1/ap?payments=true&status=pending_guarantee&pageSize=1000`)') && c.includes('dateField=cleared')
  );
  ok(
    'componente: no define helpers de fecha locales',
    !c.includes('function getLocalDateString') && !c.includes('function formatDateDisplay')
  );
}

{
  const u = existsSync(UTIL) ? crudo(UTIL) : '';
  ok(
    'utils: exporta las 3 helpers',
    u.includes('export function getLocalDateString(') &&
      u.includes('export function getFirstDayOfMonthString(') &&
      u.includes('export function formatDateDisplay(')
  );
}

{
  const p = crudo(PAGE);
  ok(
    'page: importa GuaranteeChecksView del archivo nuevo',
    p.includes("import GuaranteeChecksView from './components/GuaranteeChecksView';")
  );
  ok(
    'page: importa las helpers de fecha desde utils',
    p.includes("import { getLocalDateString, getFirstDayOfMonthString, formatDateDisplay } from '@/utils/fechasLocales';")
  );
  ok('page: ya no define GuaranteeChecksView', !p.includes('function GuaranteeChecksView() {'));
  ok(
    'page: ya no define las helpers de fecha',
    !p.includes('function getLocalDateString(') &&
      !p.includes('function getFirstDayOfMonthString(') &&
      !p.includes('function formatDateDisplay(')
  );
  ok(
    'page: sigue renderizando el componente, ahora el importado del archivo nuevo',
    p.includes('<GuaranteeChecksView />') && p.includes("import GuaranteeChecksView from './components/GuaranteeChecksView';")
  );
  ok('page: ya no contiene la logica de cheques en garantia', !p.includes('status=pending_guarantee'));
  ok('page: encoge de forma sustancial (mas de 300 lineas menos)', p.split('\n').length - 1 < 2400);
}

console.log(`\nTotal fallos: ${fallos}`);
process.exit(fallos > 0 ? 1 : 0);
