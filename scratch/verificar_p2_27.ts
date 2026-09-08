import { crudo as crudoCrudo } from './_fuente';

const crudo = (rutaRelativa: string): string => crudoCrudo(rutaRelativa).replace(/\r\n/g, '\n');

let fallos = 0;

function ok(t: string, c: boolean): void {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!c) fallos++;
}

const contar = (s: string, sub: string): number => s.split(sub).length - 1;

// ═══════════ P2-27: codigo de empleado y cedula sin restriccion unica ═══════════
// Solo habia indices NO unicos, asi que dos empleados de la misma empresa podian
// compartir codigo o cedula, y nada lo comprobaba -- ni la ruta ni el
// repositorio. En nomina eso son dos fichas para la misma persona, o un codigo
// que apunta a dos.
//
// Los unicos van POR EMPRESA (dos empresas si pueden tener la misma cedula: es la
// misma persona empleada en ambas) y son PARCIALES sobre deleted_at IS NULL,
// porque los empleados se borran en blando y reutilizar el codigo de una baja
// tiene que seguir siendo posible.

{
  const s = crudo('src/db/schema/hr.ts');
  ok('esquema hr: importa sql (hace falta para el indice parcial)', s.includes("import { sql } from 'drizzle-orm';"));
  ok(
    'esquema hr: unico de codigo de empleado por empresa',
    s.includes("companyCodeUq: uniqueIndex('employees_company_code_uq')") &&
      s.includes('.on(table.companyId, table.employeeCode)')
  );
  ok(
    'esquema hr: unico de cedula por empresa',
    s.includes("companyCedulaUq: uniqueIndex('employees_company_cedula_uq')") &&
      s.includes('.on(table.companyId, table.cedula)')
  );
  ok(
    'esquema hr: los dos son PARCIALES sobre deleted_at IS NULL (borrado en blando)',
    contar(s, '.where(sql`deleted_at IS NULL`)') === 2
  );
  ok('esquema hr: van por empresa, no globales (multiempresa)', s.includes('dos empresas SI pueden tener la misma'));
  ok(
    'esquema hr: los unicos se anaden SIN quitar los indices de busqueda anteriores',
    s.includes("codeIdx: index('employees_code_idx')") &&
      s.includes("cedulaIdx: index('employees_cedula_idx')") &&
      s.includes("uniqueIndex('employees_company_code_uq')") &&
      s.includes("uniqueIndex('employees_company_cedula_uq')")
  );
}

// El POST de la ruta YA traia un catch que devuelve 409 "El codigo de empleado o
// la cedula ya se encuentra registrado": estaba escrito esperando una restriccion
// que nunca existio. El PUT no lo tenia y soltaba el mensaje crudo de Postgres.
{
  const s = crudo('src/app/api/v1/hr/employees/route.ts');
  ok(
    'hr/employees: el alta ya distinguia el duplicado (no se toca)',
    contar(
      s,
      "error: { message: isDup ? 'El código de empleado o la cédula ya se encuentra registrado.' : e.message }"
    ) === 2
  );
  ok(
    'hr/employees: la modificacion tambien responde 409 en vez de 500',
    contar(s, '}, { status: isDup ? 409 : 500 });') === 2
  );
  ok(
    'hr/employees: la modificacion ya no suelta el mensaje crudo con 500',
    !s.includes(
      'return NextResponse.json({ success: false, error: { message: (error as Error).message } }, { status: 500 });\n  }\n}\n\nexport async function DELETE'
    )
  );
}

console.log(`\nTotal fallos: ${fallos}`);
process.exit(fallos > 0 ? 1 : 0);
