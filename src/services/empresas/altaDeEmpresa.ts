/**
 * Dar de alta una empresa con todo lo que necesita para trabajar.
 *
 * DE DONDE SALE (lote 287)
 * ------------------------
 * Este cuerpo vivia dentro de `api/v1/admin/companies/route.ts`. El registro
 * publico (`api/v1/auth/register`) hacia su propia version, y le faltaban cosas
 * que Administracion si sembraba: **los ajustes de la empresa** (`company_settings`:
 * entorno PRUEBA, formato de impresion, direccion de mSeller), **la configuracion
 * de nomina** (TSS) y **los permisos del sistema**. Una empresa sin
 * `company_settings` arranca sin entorno y sin formato de impresion. Y lo hacia
 * fuera de una transaccion: si algo fallaba a medias, quedaba una empresa sin
 * usuario que nadie podia abrir.
 *
 * Ahora las dos puertas llaman a esto, dentro de SU transaccion (quien llama la
 * abre, porque el registro inserta ademas el usuario y su auditoria, y todo tiene
 * que caer junto). Todas las siembras aceptan `tx`: catalogo, tipos de gasto,
 * periodos (JRN-11) y permisos por rol.
 *
 * `completarCuentasDelSistema` (lote 165) NO hace falta aqui, y no es un olvido:
 * existe para completar empresas ANTIGUAS. `seedDefaultChartOfAccounts` ya siembra
 * desde la misma tabla (`CUENTAS_DEL_SISTEMA`), asi que una empresa nueva nace
 * completa.
 *
 * `setup/confirm` (el asistente de la primera instalacion) tiene su propia alta y
 * no se toca en este lote: siembra planes, roles y permisos por su cuenta, y es
 * otra conversacion.
 */
import { sql, count } from 'drizzle-orm';
import { companies, companySettings, roles, payrollConfigs, permissions, type DbOTx, type DbTransaction } from '@/db';
import { seedRolePermissionsForCompany } from '@/middleware/permissions';
import { DEFAULT_COMPANY_ROLES } from '@/utils/defaultRoles';
import { AccountingRepository } from '@/repositories/accountingRepository';

export interface EmpresaNueva {
  name: string;
  /** Solo digitos: pasar antes por `rncDeLaEmpresa`. */
  rnc: string;
  email?: string | null;
  businessActivity?: string | null;
  address?: string | null;
  status?: 'active' | 'inactive';
}

/**
 * ¿Ya hay una empresa con este RNC? Mira TODAS, tambien las desactivadas: el
 * indice unico no distingue, y una desactivada sigue siendo de alguien.
 *
 * Se compara sin guiones porque Administracion, antes de este lote, guardaba lo
 * que se escribiera (un "101-00100-1" cabia en las 11 posiciones de la columna).
 */
export async function rncYaTieneEmpresa(tx: DbOTx, rnc: string): Promise<boolean> {
  const [fila] = await tx
    .select({ id: companies.id })
    .from(companies)
    .where(sql`regexp_replace(${companies.rnc}, '[^0-9]', '', 'g') = ${rnc}`)
    .limit(1);
  return !!fila;
}

/**
 * Crea la empresa y siembra lo suyo. Devuelve la empresa y los roles globales
 * (el registro necesita el de administracion para su usuario).
 */
export async function crearEmpresaConSuSiembra(tx: DbTransaction, datos: EmpresaNueva) {
  // 1. La empresa
  const [empresa] = await tx.insert(companies).values({
    name: datos.name,
    rnc: datos.rnc,
    email: datos.email ?? undefined,
    businessActivity: datos.businessActivity ?? undefined,
    address: datos.address ?? undefined,
    status: datos.status ?? 'active',
  }).returning();

  // 2. Sus ajustes. Nace en PRUEBA: lo que emita no vale ante la DGII hasta que
  //    alguien lo cambie a sabiendas.
  await tx.insert(companySettings).values({
    companyId: empresa.id,
    dgiiEnv: 'PRUEBA',
    printLayout: 'carta',
    printCopies: 2,
    msellerUrl: 'https://ecf.api.mseller.app/v1',
    autoDeliveryNotes: false,
  });

  // 3. Roles globales (se siembran si no hay ninguno)
  const checkRoles = await tx.select({ value: count() }).from(roles);
  let allRoles: { id: string; name: string }[] = [];
  if ((checkRoles[0]?.value || 0) === 0) {
    allRoles = await tx.insert(roles).values(
      DEFAULT_COMPANY_ROLES.map((role) => ({
        name: role.name,
        description: role.description,
        isFixed: role.isFixed,
      }))
    ).returning({ id: roles.id, name: roles.name });
  } else {
    allRoles = await tx.select({ id: roles.id, name: roles.name }).from(roles);
  }

  // 4. Configuracion de nomina por defecto (tasas de la TSS)
  await tx.insert(payrollConfigs).values({
    companyId: empresa.id,
    afpEmployee: '0.0287',
    sfsEmployee: '0.0304',
    afpEmployer: '0.0710',
    sfsEmployer: '0.0709',
    infotepEmployer: '0.0100',
    riskEmployer: '0.0110', // 1.10% standard risk rate
    overtimeDiurnaRate: '1.35',
    overtimeNocturnaRate: '1.85',
    overtimeFestivaRate: '2.00',
    overtimeDobleRate: '2.00',
  });

  // 5. Catalogo de cuentas, cuentas puente, tipos de gasto y periodos
  await AccountingRepository.seedDefaultChartOfAccounts(empresa.id, tx);
  await AccountingRepository.seedDefaultExpenseTypes(empresa.id, tx);
  // Auditoria JRN-11: sin periodos contables la empresa no puede asentar
  // nada. Antes los creaba `isPeriodOpen` de uno en uno y solo la primera
  // vez, asi que al cambiar de mes la empresa se bloqueaba en silencio.
  await AccountingRepository.sembrarPeriodosContables(empresa.id, tx);

  // 6. Permisos del sistema (11 modulos x 5 acciones)
  const modules = [
    'caja',
    'facturacion',
    'contabilidad',
    'banco',
    'clientes',
    'proveedores',
    'catalogo',
    'reportes',
    'administracion',
    'auditoria',
    'cobros',
  ] as const;
  const actions = ['read', 'write', 'delete', 'execute', 'admin'] as const;
  const allPermissionsToUpsert = [];
  for (const mod of modules) {
    for (const action of actions) {
      allPermissionsToUpsert.push({
        module: mod,
        action,
        description: `Permiso de ${action} en módulo ${mod}`,
      });
    }
  }
  await tx.insert(permissions).values(allPermissionsToUpsert).onConflictDoNothing();

  // 7. Permisos por rol de la empresa
  await seedRolePermissionsForCompany(tx, empresa.id, allRoles);

  return { empresa, roles: allRoles };
}
