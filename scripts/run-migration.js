const postgres = require('postgres');
const fs = require('fs');
const path = require('path');

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

async function run() {
  if (!connectionString) {
    console.error('DATABASE_URL not found in .env file!');
    process.exit(1);
  }
  console.log('Connecting to database...');
  const sql = postgres(connectionString, { ssl: 'require' });

  try {
    console.log('Running SQL commands...');
    
    // 1. Create sequences table
    await sql`
      CREATE TABLE IF NOT EXISTS public.factura_secuencias (
          anio INTEGER PRIMARY KEY,
          ultimo_numero BIGINT NOT NULL DEFAULT 0
      );
    `;
    console.log('Created factura_secuencias table.');

    // 2. Add codigo_factura column to invoices
    await sql`
      ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS codigo_factura VARCHAR(50);
    `;
    console.log('Added codigo_factura column.');

    // 3. Create unique index and constraint
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS invoices_codigo_factura_idx ON public.invoices(codigo_factura);
    `;
    
    // Check if unique constraint exists, if not add it
    const constraintCheck = await sql`
      SELECT conname 
      FROM pg_constraint 
      WHERE conname = 'invoices_codigo_factura_unique';
    `;
    
    if (constraintCheck.length === 0) {
      await sql`
        ALTER TABLE public.invoices ADD CONSTRAINT invoices_codigo_factura_unique UNIQUE USING INDEX invoices_codigo_factura_idx;
      `;
      console.log('Added UNIQUE constraint to codigo_factura.');
    } else {
      console.log('UNIQUE constraint already exists.');
    }

    // 4. Create sequence generator function
    await sql`
      CREATE OR REPLACE FUNCTION public.obtener_siguiente_codigo_factura(p_anio INTEGER)
      RETURNS VARCHAR AS $$
      DECLARE
          v_ultimo_numero BIGINT;
          v_codigo VARCHAR;
      BEGIN
          INSERT INTO public.factura_secuencias (anio, ultimo_numero)
          VALUES (p_anio, 1)
          ON CONFLICT (anio) 
          DO UPDATE SET ultimo_numero = factura_secuencias.ultimo_numero + 1
          RETURNING ultimo_numero INTO v_ultimo_numero;

          v_codigo := 'FAC-' || p_anio || '-' || LPAD(v_ultimo_numero::text, 6, '0');
          RETURN v_codigo;
      END;
      $$ LANGUAGE plpgsql;
    `;
    console.log('Created obtener_siguiente_codigo_factura function.');

    // 5. Create trigger function
    await sql`
      CREATE OR REPLACE FUNCTION public.trg_invoices_assign_codigo_factura()
      RETURNS TRIGGER AS $$
      DECLARE
          v_anio INTEGER;
      BEGIN
          IF NEW.codigo_factura IS NULL THEN
              IF NEW.created_at IS NOT NULL THEN
                  v_anio := EXTRACT(YEAR FROM NEW.created_at)::INTEGER;
              ELSE
                  v_anio := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
              END IF;
              NEW.codigo_factura := public.obtener_siguiente_codigo_factura(v_anio);
          END IF;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `;
    console.log('Created trg_invoices_assign_codigo_factura function.');

    // 6. Create trigger
    await sql`
      DROP TRIGGER IF EXISTS trg_assign_codigo_factura ON public.invoices;
    `;
    await sql`
      CREATE TRIGGER trg_assign_codigo_factura
      BEFORE INSERT ON public.invoices
      FOR EACH ROW
      EXECUTE FUNCTION public.trg_invoices_assign_codigo_factura();
    `;
    console.log('Created BEFORE INSERT trigger on public.invoices.');

    console.log('Migration successful!');
  } catch (err) {
    console.error('Migration failed:', err.message);
  } finally {
    await sql.end();
  }
}

run();
