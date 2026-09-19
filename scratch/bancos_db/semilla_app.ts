/**
 * Segunda mitad de la semilla: la configuracion que la APLICACION siembra al
 * dar de alta una empresa (`api/v1/admin/companies`), con sus mismos
 * sembradores. Escribirla a mano en SQL seria copiar el catalogo de cuentas y
 * dejarlo atrasado en cuanto el sembrador cambie; asi los bancos ven lo mismo
 * que ve una empresa nueva de verdad.
 *
 * Corre despues de `semilla.sql` (empresas, usuarios, almacenes...) y solo con
 * el candado precargado: `tsx --import ./scratch/bancos_db/precarga.mts`.
 */
import { db } from '../../src/db';
import { payrollConfigs } from '../../src/db/schema';
import { AccountingRepository } from '../../src/repositories/accountingRepository';
import { exigirBaseDesechable } from './candado';

const EMPRESAS = [
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
];

async function main() {
  // La precarga ya lo comprueba; se repite porque este fichero escribe y un
  // `tsx` lanzado a mano sin la precarga no debe poder sembrar otra base.
  await exigirBaseDesechable();

  for (const empresa of EMPRESAS) {
    await db.transaction(async (tx) => {
      // Los mismos valores que `admin/companies` al crear la empresa.
      await tx.insert(payrollConfigs).values({
        companyId: empresa,
        afpEmployee: '0.0287',
        sfsEmployee: '0.0304',
        afpEmployer: '0.0710',
        sfsEmployer: '0.0709',
        infotepEmployer: '0.0100',
        riskEmployer: '0.0110',
        overtimeDiurnaRate: '1.35',
        overtimeNocturnaRate: '1.85',
        overtimeFestivaRate: '2.00',
        overtimeDobleRate: '2.00',
      });
      await AccountingRepository.seedDefaultChartOfAccounts(empresa, tx);
      await AccountingRepository.seedDefaultExpenseTypes(empresa, tx);
      // Desde enero de 2026 y no desde hoy: los bancos fechan sus movimientos
      // a lo largo de todo el año (junio, agosto...). Doble pasada para cubrir
      // tambien lo que queda hasta hoy mas los meses que abre por delante.
      await AccountingRepository.sembrarPeriodosContables(empresa, tx, new Date(Date.UTC(2026, 0, 15)));
      await AccountingRepository.sembrarPeriodosContables(empresa, tx);
    });
  }
  console.log(`Semilla de la aplicacion: ${EMPRESAS.length} empresas (nomina, catalogo, tipos de gasto, periodos).`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
