const postgres = require('postgres');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Manually parse .env file
const envPath = path.join(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const cleanLine = line.trim();
  if (cleanLine && !cleanLine.startsWith('#')) {
    const parts = cleanLine.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim();
      envVars[key] = val;
    }
  }
});

const connectionString = envVars.DATABASE_URL;

const defaultAccounts = [
  // 1. Activos
  { code: '1', name: 'Activos', type: 'asset' },
  { code: '1.1', name: 'Activos Corrientes', type: 'asset' },
  { code: '1.1.01', name: 'Efectivo en Caja y Bancos', type: 'asset' },
  { code: '1.1.01.01', name: 'Caja General', type: 'asset' },
  { code: '1.1.01.02', name: 'Caja Chica', type: 'asset' },
  { code: '1.1.01.03', name: 'Banco de Reservas', type: 'asset' },
  { code: '1.1.01.04', name: 'Banco Popular', type: 'asset' },
  { code: '1.1.01.05', name: 'Banco BHD', type: 'asset' },
  { code: '1.1.02', name: 'Cuentas por Cobrar Clientes', type: 'asset' },
  { code: '1.1.03', name: 'Anticipo de Impuestos - Retención ISR', type: 'asset' },
  { code: '1.1.04', name: 'Anticipo de Impuestos - Retención ITBIS', type: 'asset' },
  { code: '1.1.05', name: 'Anticipo de Impuestos - Otras Retenciones', type: 'asset' },
  { code: '1.1.06', name: 'Inventario de Mercancía', type: 'asset' },
  { code: '1.1.07', name: 'ITBIS Pagado en Compras (Adelantado)', type: 'asset' },
  { code: '1.1.08', name: 'Gastos Pagados por Anticipado', type: 'asset' },
  { code: '1.2', name: 'Activos No Corrientes (Propiedades, Planta y Equipo)', type: 'asset' },
  { code: '1.2.01', name: 'Terrenos', type: 'asset' },
  { code: '1.2.02', name: 'Edificios', type: 'asset' },
  { code: '1.2.03', name: 'Equipos de Transporte', type: 'asset' },
  { code: '1.2.04', name: 'Mobiliario y Equipos de Oficina', type: 'asset' },
  { code: '1.2.05', name: 'Equipos de Computación', type: 'asset' },
  { code: '1.2.06', name: 'Depreciación Acumulada', type: 'asset' },

  // 2. Pasivos
  { code: '2', name: 'Pasivos', type: 'liability' },
  { code: '2.1', name: 'Pasivos Corrientes (A Corto Plazo)', type: 'liability' },
  { code: '2.1.01', name: 'Cuentas por Pagar Proveedores', type: 'liability' },
  { code: '2.1.02', name: 'Acumulaciones y Gastos por Pagar', type: 'liability' },
  { code: '2.1.03', name: 'ITBIS por Pagar (Retenido en Ventas)', type: 'liability' },
  { code: '2.1.04', name: 'Retenciones de Impuestos por Pagar (ISR, ITBIS)', type: 'liability' },
  { code: '2.1.05', name: 'Retenciones TSS por Pagar', type: 'liability' },
  { code: '2.1.06', name: 'Porción Corriente de Préstamos a Largo Plazo', type: 'liability' },
  { code: '2.2', name: 'Pasivos No Corrientes (A Largo Plazo)', type: 'liability' },
  { code: '2.2.01', name: 'Préstamos Bancarios a Largo Plazo', type: 'liability' },
  { code: '2.2.02', name: 'Documentos por Pagar a Largo Plazo', type: 'liability' },

  // 3. Capital / Patrimonio
  { code: '3', name: 'Capital / Patrimonio', type: 'equity' },
  { code: '3.1', name: 'Capital Social', type: 'equity' },
  { code: '3.2', name: 'Resultados Acumulados (Años Anteriores)', type: 'equity' },
  { code: '3.3', name: 'Resultado del Ejercicio (Año en Curso)', type: 'equity' },
  { code: '3.4', name: 'Reservas Legales', type: 'equity' },

  // 4. Ingresos
  { code: '4', name: 'Ingresos', type: 'revenue' },
  { code: '4.1', name: 'Ingresos Operacionales', type: 'revenue' },
  { code: '4.1.01', name: 'Ingresos por Ventas', type: 'revenue' },
  { code: '4.1.02', name: 'Ingresos por Servicios', type: 'revenue' },
  { code: '4.1.03', name: 'Devoluciones y Descuentos en Ventas', type: 'revenue' },
  { code: '4.2', name: 'Ingresos No Operacionales', type: 'revenue' },
  { code: '4.2.01', name: 'Ingresos por Intereses', type: 'revenue' },
  { code: '4.2.02', name: 'Otros Ingresos', type: 'revenue' },

  // 5. Costos
  { code: '5', name: 'Costos de Ventas', type: 'expense' },
  { code: '5.1.01', name: 'Costo de Ventas (Mercancías)', type: 'expense' },

  // 6. Gastos
  { code: '6', name: 'Gastos Operacionales', type: 'expense' },
  { code: '6.1.01', name: 'Sueldos y Salarios (Nómina)', type: 'expense' },
  { code: '6.1.02', name: 'TSS (Aportes Patronales)', type: 'expense' },
  { code: '6.1.03', name: 'Servicios Públicos (Agua, Luz, Teléfono)', type: 'expense' },
  { code: '6.1.04', name: 'Alquileres / Arrendamientos', type: 'expense' },
  { code: '6.1.05', name: 'Publicidad y Propaganda', type: 'expense' },
  { code: '6.1.06', name: 'Gastos de Combustible y Transporte', type: 'expense' },
  { code: '6.1.07', name: 'Reparación y Mantenimiento', type: 'expense' },
  { code: '6.1.08', name: 'Depreciación de Activos Fijos', type: 'expense' },
  { code: '6.1.09', name: 'Gastos Diversos', type: 'expense' }
];

async function seed() {
  if (!connectionString) {
    console.error('DATABASE_URL not found in .env file!');
    process.exit(1);
  }
  console.log('Connecting to database...');
  const sql = postgres(connectionString, { ssl: 'require' });

  try {
    console.log('Fetching all companies...');
    const companies = await sql`SELECT id, name FROM public.companies;`;

    console.log(`Found ${companies.length} companies.`);

    for (const company of companies) {
      console.log(`Seeding chart of accounts for company: ${company.name} (${company.id})`);
      
      for (const account of defaultAccounts) {
        // Find if code already exists for this company
        const existing = await sql`
          SELECT id FROM public.chart_of_accounts 
          WHERE company_id = ${company.id} AND code = ${account.code} AND deleted_at IS NULL;
        `;

        if (existing.length === 0) {
          const newId = uuidv4();
          await sql`
            INSERT INTO public.chart_of_accounts (id, company_id, code, name, type, status, created_at, updated_at)
            VALUES (${newId}, ${company.id}, ${account.code}, ${account.name}, ${account.type}, 'active', NOW(), NOW());
          `;
          console.log(`  Added account: ${account.code} - ${account.name}`);
        } else {
          // Update the account name/type if it already exists to guarantee it has standard properties
          await sql`
            UPDATE public.chart_of_accounts
            SET name = ${account.name}, type = ${account.type}, updated_at = NOW()
            WHERE company_id = ${company.id} AND code = ${account.code} AND deleted_at IS NULL;
          `;
        }
      }
      console.log(`Finished seeding for ${company.name}`);
    }

    console.log('Seeding chart of accounts completed successfully!');
  } catch (error) {
    console.error('Error during seeding:', error);
  } finally {
    await sql.end();
  }
}

seed();
