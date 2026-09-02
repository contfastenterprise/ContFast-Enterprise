/**
 * Genera `scratch/reparar_ledger_migraciones.sql` a partir del journal.
 *
 * POR QUE EXISTE
 * --------------
 * El fichero de reparacion lleva dentro el hash y el `when` de CADA entrada del
 * journal, repetidos en tres sitios. Su propia cabecera lo decia:
 *
 *     ESTE FICHERO CADUCA CADA VEZ QUE SE ANADE UNA MIGRACION
 *
 * Y no es un aviso teorico. Ya caduco dos veces en esta auditoria, y el modo de
 * fallar es el peor posible: si se ejecuta una version vieja despues de aplicar
 * migraciones nuevas, esas nuevas quedan por DEBAJO del `created_at` maximo sin
 * registrar, y drizzle no mira hacia atras -- solo compara contra el maximo:
 *
 *     if (!lastDbMigration || Number(lastDbMigration.created_at) < migration.folderMillis)
 *
 * O sea que quedan enterradas para siempre. Un fichero que hay que acordarse de
 * regenerar a mano, y cuyo olvido es irreversible, no es un fichero: es una
 * trampa. Asi que se genera.
 *
 *     npx tsx scratch/generar_reparacion_ledger.ts
 *
 * LO UNICO QUE HAY QUE MANTENER A MANO
 * ------------------------------------
 * MARCADORES: por cada migracion aplicada a mano, COMO se comprueba en la base
 * que esta puesta de verdad. Eso no se puede deducir del fichero .sql, hay que
 * saber que crea. El generador se niega a emitir nada si la ultima migracion
 * del journal no tiene marcador, que es justo el caso de "acabo de anadir una
 * migracion y no lo he pensado".
 */
import { readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';

const RAIZ = join(__dirname, '..');

/**
 * Como se comprueba en la base que una migracion esta aplicada.
 *
 * Solo hacen falta para las que se aplicaron A MANO (de la 0025_immutable en
 * adelante): las anteriores se dan por puestas y no se comprueban, igual que
 * hacia la version escrita a mano.
 */
const MARCADORES: Record<string, { sql: string; falta: string }> = {
  '0025_immutable_audit_logs': {
    sql: "EXISTS (SELECT 1 FROM pg_proc WHERE proname='prevent_audit_log_modification')",
    falta: 'falta la funcion prevent_audit_log_modification',
  },
  '0033_producto_sin_inventario': {
    sql: "EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='tracks_inventory')",
    falta: 'falta la columna products.tracks_inventory',
  },
  '0034_secuencia_codigo_factura': {
    sql: "to_regclass('public.invoice_sequences') IS NOT NULL",
    falta: 'falta la tabla invoice_sequences',
  },
  '0035_envio_dgii_por_intento': {
    sql: "EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='dgii_submissions_invoice_created_idx')",
    falta: 'falta el indice dgii_submissions_invoice_created_idx',
  },
  '0036_saldo_banco_por_entorno': {
    sql: "to_regclass('public.bank_account_balances') IS NOT NULL",
    falta: 'falta la tabla bank_account_balances',
  },
  '0037_negar_acceso_publico': {
    sql: "EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND policyname='sin_acceso_publico')",
    falta: 'falta la politica sin_acceso_publico',
  },
  '0038_vistas_publicas_por_empresa': {
    sql: "to_regclass('public.v_public_products') IS NOT NULL AND pg_get_viewdef('public.v_public_products'::regclass, true) LIKE '%pli.company_id = p.company_id%'",
    falta: 'falta el arreglo de la vista v_public_products',
  },
  '0039_tasa_itbis_por_linea': {
    sql: "EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoice_lines' AND column_name='tax_rate')",
    falta: 'falta la columna invoice_lines.tax_rate',
  },
  '0040_tasa_itbis_por_linea_cotizacion': {
    sql: "EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quote_lines' AND column_name='tax_rate')",
    falta: 'falta la columna quote_lines.tax_rate',
  },
  '0032_aislamiento_estructural': {
    sql: "EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_payable_id_company_uq')",
    falta: 'falta la restriccion accounts_payable_id_company_uq',
  },
  '0042_exento_o_tasa_cero': {
    sql: "EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoice_lines' AND column_name='tax_category')",
    falta: 'falta la columna invoice_lines.tax_category',
  },
  '0041_codigo_seguridad_por_envio': {
    sql: "EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='dgii_submissions' AND column_name='security_code')",
    falta: 'falta la columna dgii_submissions.security_code',
  },
};

interface Entrada { tag: string; when: number; hash: string }

function leerJournal(): Entrada[] {
  const j = JSON.parse(readFileSync(join(RAIZ, 'drizzle/meta/_journal.json'), 'utf8'));
  return j.entries
    .slice()
    .sort((a: any, b: any) => a.when - b.when)
    .map((e: any) => ({
      tag: e.tag,
      when: e.when,
      // Drizzle hashea el CONTENIDO CRUDO del fichero, sin normalizar nada.
      hash: createHash('sha256')
        .update(readFileSync(join(RAIZ, 'drizzle', `${e.tag}.sql`)))
        .digest('hex'),
    }));
}

function generar(): string {
  const entradas = leerJournal();
  const ultima = entradas[entradas.length - 1];

  if (!MARCADORES[ultima.tag]) {
    throw new Error(
      `La ultima migracion del journal (${ultima.tag}) no tiene marcador en MARCADORES.\n` +
      'Anade como se comprueba en la base que esta aplicada y vuelve a generar.\n' +
      'Sin marcador no se puede saber si esta puesta, y registrarla a ciegas es\n' +
      'exactamente lo que este fichero existe para impedir.'
    );
  }

  const lista = (sangria: string) =>
    entradas
      .map((e) => `${sangria}('${e.tag}', ${e.when}::bigint, '${e.hash}')`)
      .join(',\n');

  // Guarda: todas las que tengan marcador MENOS la ultima. La ultima puede
  // estar legitimamente sin aplicar (va al final del journal justamente para
  // que `migrate` pueda aplicarla por la via normal sin dejar hueco).
  const guarda = entradas
    .filter((e) => MARCADORES[e.tag] && e.tag !== ultima.tag)
    .map((e) => `  IF NOT (${MARCADORES[e.tag].sql}) THEN
    faltan := array_append(faltan, '${e.tag} (${MARCADORES[e.tag].falta})');
  END IF;
`)
    .join('\n');

  // Altas. Las que tienen marcador se registran SOLO si su marcador existe: no
  // se apunta en el ledger nada que no sea cierto.
  const altas = entradas
    .map((e) => {
      const m = MARCADORES[e.tag];
      const cond = m ? `\n     AND (${m.sql})` : '';
      return `  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT '${e.hash}', ${e.when}::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = '${e.hash}')${cond};  --  ${e.tag}`;
    })
    .join('\n');

  // Que queda pendiente: las que tienen marcador y NO acabaron registradas.
  // Como sus altas son condicionales al marcador, "no registrada" es
  // exactamente "no aplicada". No hace falta repetir aqui la condicion.
  const pendientes = entradas
    .filter((e) => MARCADORES[e.tag])
    .map((e) => `           ('${e.tag}', '${e.hash}')`)
    .join(',\n');

  return `-- ============================================================================
--  REPARAR EL LEDGER DE MIGRACIONES
-- ============================================================================
--
--  GENERADO. No editar a mano.
--
--      npx tsx scratch/generar_reparacion_ledger.ts
--
--  Generado el ${new Date().toISOString().slice(0, 10)} desde drizzle/meta/_journal.json
--  (${entradas.length} entradas; la ultima, ${ultima.tag}).
--
--  QUE ARREGLA
--  -----------
--  \`drizzle.__drizzle_migrations\` se quedo en la 0007. De ahi en adelante las
--  migraciones se aplicaron a mano y la tabla no se entero, asi que para drizzle
--  hay migraciones pendientes que en realidad ya estan puestas.
--
--  Hoy eso no rompe un despliegue: \`migrate.ts\` no esta enganchado a ningun
--  script de npm (\`build\` es \`next build\` a secas), asi que Vercel no lo llama.
--  Y si alguien lo ejecutase a mano, drizzle mete TODAS las pendientes en UNA
--  sola transaccion: fallaria al crear algo que ya existe y lo desharia todo.
--  Falla ruidosamente y no rompe nada.
--
--  El precio real es otro: mientras el ledger mienta, \`migrate\` no puede
--  avanzar, y por tanto ninguna migracion nueva se aplica por la via normal.
--
--  LA TRAMPA QUE HAY QUE CONOCER
--  -----------------------------
--  Drizzle compara UNICAMENTE el \`created_at\` mas reciente del ledger contra el
--  \`when\` de cada entrada del journal. Ni mira los hashes:
--
--      if (!lastDbMigration || Number(lastDbMigration.created_at) < migration.folderMillis)
--
--  Como solo cuenta el maximo, un hueco en medio NO se recupera JAMAS.
--
--  Comprobado, no supuesto. Con una version anterior de este fichero y la 0035
--  sin aplicar: el ledger quedaba en 36 filas, \`migrate\` reportaba 1 pendiente
--  y la 0035 no aparecia ni registrada ni pendiente. Se habia perdido en
--  silencio. Por eso este fichero se niega a correr si algo falta, y por eso
--  ahora se GENERA en vez de mantenerse a mano: la version vieja de un fichero
--  escrito a mano es indistinguible de la buena hasta que ya es tarde.
--
--  ORDEN DE USO
--  ------------
--  Aplicar primero las migraciones que falten, y DESPUES ejecutar esto. La
--  guarda comprueba una por una que esten de verdad puestas -- mirando sus
--  objetos en la base, no fiandose de nadie -- y aborta nombrando las que
--  falten.
--
--  Va entero dentro de un solo DO: una sola sentencia, que PostgreSQL deshace
--  completa si algo falla. No puede quedar a medias.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS drizzle;
CREATE TABLE IF NOT EXISTS drizzle."__drizzle_migrations" (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);

DO $reparar$
DECLARE
  faltan text[] := ARRAY[]::text[];
  n_antes integer;
  n_despues integer;
  tope bigint;
  pendientes text[];
BEGIN
  SELECT count(*) INTO n_antes FROM drizzle."__drizzle_migrations";
  RAISE NOTICE 'Ledger: % filas antes de reparar.', n_antes;

  -- ------------------------------------------------------------------
  -- 1. GUARDA. Nada de esto se puede quedar por debajo del maximo sin
  --    estar aplicado de verdad: quedaria enterrado para siempre.
  --
  --    La ultima del journal (${ultima.tag})
  --    NO se comprueba aqui: puede estar legitimamente pendiente, y va al
  --    final justamente para que \`migrate\` la aplique sin dejar hueco.
  -- ------------------------------------------------------------------
${guarda}
  IF array_length(faltan, 1) > 0 THEN
    RAISE EXCEPTION E'ABORTADO: hay migraciones anteriores que NO estan aplicadas.\\nRegistrarlas ahora las enterraria para siempre (drizzle solo mira el created_at maximo).\\nAplica primero estas y vuelve a ejecutar:\\n  - %', array_to_string(faltan, E'\\n  - ');
  END IF;

  -- ------------------------------------------------------------------
  -- 2. Registrar. Cada INSERT es idempotente por hash, y las que tienen
  --    marcador solo se registran si su marcador existe en la base: no se
  --    apunta en el ledger nada que no sea cierto.
  -- ------------------------------------------------------------------
${altas}

  -- ------------------------------------------------------------------
  -- 3. Poner al dia las marcas de tiempo.
  --
  --    Los INSERT de arriba son idempotentes por hash: si la fila ya estaba,
  --    no la tocan. El problema es que el \`when\` de una entrada CAMBIA cuando
  --    se mete otra migracion delante en el journal. Observado con la 0032:
  --    estaba aplicada Y registrada, pero con su marca vieja, que quedaba por
  --    debajo de la ultima. \`migrate\` la veia como PENDIENTE.
  -- ------------------------------------------------------------------
  WITH journal(tag, cuando, h) AS (VALUES
${lista('           ')}
  )
  UPDATE drizzle."__drizzle_migrations" m
     SET created_at = j.cuando
    FROM journal j
   WHERE m.hash = j.h AND m.created_at IS DISTINCT FROM j.cuando;
  GET DIAGNOSTICS n_despues = ROW_COUNT;
  IF n_despues > 0 THEN
    RAISE NOTICE 'Marcas de tiempo corregidas en % fila(s) (el journal se reordeno).', n_despues;
  END IF;

  -- ------------------------------------------------------------------
  -- 4. Comprobar que no quedo ningun hueco por debajo del maximo.
  -- ------------------------------------------------------------------
  SELECT count(*), max(created_at) INTO n_despues, tope FROM drizzle."__drizzle_migrations";

  SELECT array_agg(v.tag ORDER BY v.cuando) INTO faltan
    FROM (VALUES
${lista('           ')}
         ) AS v(tag, cuando, h)
   WHERE v.cuando < tope
     AND NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" m WHERE m.hash = v.h);

  IF faltan IS NOT NULL THEN
    RAISE EXCEPTION 'FALLO: quedaron huecos por debajo del maximo (%). Serian irrecuperables: %', tope, array_to_string(faltan, ', ');
  END IF;

  RAISE NOTICE 'COMPROBADO: % filas (antes %), ultimo created_at %, sin huecos.', n_despues, n_antes, tope;

  -- ------------------------------------------------------------------
  -- 5. Que queda pendiente. Como las altas de arriba son condicionales al
  --    marcador de cada migracion, "no registrada" significa exactamente "no
  --    aplicada", y basta con mirar quien no quedo en el ledger. No se
  --    escribe a mano: la version anterior decia siempre "la 0032", y eso
  --    dejo de ser cierto en cuanto la 0032 se aplico.
  -- ------------------------------------------------------------------
  SELECT array_agg(t.tag ORDER BY t.tag) INTO pendientes
    FROM (VALUES
${pendientes}
         ) AS t(tag, h)
   WHERE NOT EXISTS (
     SELECT 1 FROM drizzle."__drizzle_migrations" m WHERE m.hash = t.h
   );

  IF pendientes IS NOT NULL THEN
    RAISE NOTICE 'Sin registrar (no aplicadas): %. \`migrate\` las aplicara.', array_to_string(pendientes, ', ');
  ELSE
    RAISE NOTICE 'No queda ninguna migracion pendiente.';
  END IF;
END $reparar$;
`;
}

const destino = join(RAIZ, 'scratch/reparar_ledger_migraciones.sql');
writeFileSync(destino, generar());
console.log(`Generado ${destino}`);
