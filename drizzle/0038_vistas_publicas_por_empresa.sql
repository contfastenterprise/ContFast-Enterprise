-- ============================================================================
--  0038  --  `v_public_products`: atar la union a una sola empresa
-- ============================================================================
--
--  DE QUE VA
--  ---------
--  Las tres vistas `v_public_*` (migracion 0001) no las consulta NADIE: ni una
--  referencia en `src/`. Andamiaje, como el `?token=` del PDF o
--  `withTenantContext`. Se dejan -- pueden hacer falta para un catalogo publico
--  -- pero se arreglan, porque el dia que alguien las use heredaria el fallo
--  sin enterarse de que lo hereda.
--
--  De las tres, solo `v_public_products` tenia algo que arreglar.
--
--  1. LA UNION NO ATABA LAS EMPRESAS
--  ---------------------------------
--  Iba `products` -> `price_list_items` -> `price_lists`. Las tres tablas
--  llevan `company_id` y la vista no los igualaba. Un renglon de tarifa de la
--  empresa B apuntando a un producto de la empresa A salia como producto de A
--  con el PRECIO de B. Reproducido en el banco:
--
--      catalogo de Alfa SRL, producto "Puerta de roble":
--        antes ..... 2 renglones -> 1200.00 (suyo) y 1.00 (de Beta SRL)
--        despues ... 1 renglon   -> 1200.00
--
--  No es que se vea de mas: es que se ve MAL, con el sello de la empresa que no
--  es y a un precio que no es. En una tarifa publica, eso se vende.
--
--  Hacen falta las DOS igualdades, y no es celo. Con tres cruces distintos:
--      renglon B, tarifa B, producto A .... lo atrapan las dos
--      renglon B, tarifa A, producto A .... solo `pli.company_id = p.company_id`
--      renglon A, tarifa B, producto A .... solo `pl.company_id  = p.company_id`
--
--  Que hoy pueda ocurrir depende de la base: la 0032 pone claves foraneas
--  compuestas en `price_list_items` que lo impiden de raiz. Donde la 0032 no
--  este aplicada, entra. Esta vista deja de repetirlo aunque la fila mal
--  sellada exista.
--
--  Y ojo: la vista TAPA la fila cruzada, no la cura. Para que no se quede
--  tapada para siempre esta `scratch/diagnostico_tarifas_cruzadas.sql`.
--
--  2. NO MIRABA `price_list_items.deleted_at`
--  ------------------------------------------
--  Miraba el borrado del producto y el de la tarifa, pero no el del renglon.
--  Un precio borrado seguia publicandose.
--
--  3. Y UN TERCERO QUE NO ES UN FILTRO
--  -----------------------------------
--  Un producto en dos tarifas publicas salia DOS VECES con DOS precios, y quien
--  leyera la vista con `LIMIT 1` se llevaba el que quisiera el planificador --
--  el mismo patron que ya aparecio en `ecf_sequences` y en `dgii_submissions`.
--  Se decide aqui, en un solo sitio: un renglon por producto, el de la tarifa
--  publica mas RECIENTE, con `pli.id` de desempate para que el resultado no
--  dependa del plan de ejecucion.
--
--  LO QUE NO LES FALTABA
--  ---------------------
--  `modo`. `products`, `product_categories`, `price_lists` y `price_list_items`
--  NO tienen columna `modo`, y hacen bien: `modo` vive en las 43 tablas
--  transaccionales. Un producto es el mismo se facture en PRUEBA o en
--  PRODUCCION; lo que cambia de entorno es la factura, no el catalogo.
--
--  Filtrar "por la empresa actual" tampoco: una vista no sabe quien pregunta.
--  Exponen `company_id` para que quien las use filtre. Que no se puedan leer
--  desde fuera es cosa de la 0037.
--
--  `v_public_categories` y `v_public_price_lists` se quedan como estaban: leen
--  una sola tabla, no hay union que atar, y ya miraban `status` y `deleted_at`.
--
--  ============================================================================
--  POR QUE ESTA VERSION COMPRUEBA LO QUE HIZO
--  ============================================================================
--  La primera version era un `CREATE OR REPLACE VIEW` suelto. Se aplico, se
--  dio por aplicada... y la comprobacion posterior en produccion devolvio que
--  la vista seguia siendo la vieja. Sin rastro de por que: el fichero no dejaba
--  constancia de nada.
--
--  Asi que ahora la migracion:
--    - dice por NOTICE lo que encuentra antes de tocar;
--    - si `CREATE OR REPLACE` no puede (basta con que la vista existente tenga
--      otros nombres o tipos de columna para que PostgreSQL lo rechace),
--      recurre a DROP + CREATE, pero solo si NADA depende de la vista;
--    - y al final RELEE la definicion y ABORTA si el arreglo no esta puesto.
--
--  Es el mismo principio que el resto de la auditoria: que "lo ejecute" y "esta
--  aplicado" no puedan separarse en silencio.
-- ============================================================================

DO $$
DECLARE
  definicion   text;
  dependientes text;
  cuerpo       text := $vista$
SELECT DISTINCT ON (p.id)
       p.id,
       p.company_id,
       p.category_id,
       p.sku,
       p.name,
       p.description,
       pli.price,
       p.status,
       p.deleted_at
  FROM products p
  JOIN price_list_items pli
    ON pli.product_id = p.id
   AND pli.company_id = p.company_id
   AND pli.deleted_at IS NULL
  JOIN price_lists pl
    ON pl.id = pli.price_list_id
   AND pl.company_id = p.company_id
   AND pl.is_public = true
   AND pl.status = 'active'
   AND pl.deleted_at IS NULL
 WHERE p.status = 'active'
   AND p.deleted_at IS NULL
 ORDER BY p.id, pl.created_at DESC, pli.id
$vista$;
BEGIN
  IF to_regclass('public.v_public_products') IS NULL THEN
    RAISE NOTICE '0038: `v_public_products` no existe todavia. Se crea.';
  ELSE
    RAISE NOTICE '0038: `v_public_products` existe. Se sustituye.';
  END IF;

  BEGIN
    EXECUTE 'CREATE OR REPLACE VIEW public.v_public_products AS ' || cuerpo;
    RAISE NOTICE '0038: sustituida con CREATE OR REPLACE.';
  EXCEPTION WHEN OTHERS THEN
    -- Motivo habitual: la vista existente tiene otras columnas, y PostgreSQL
    -- no deja cambiarlas con OR REPLACE. Se recurre a DROP + CREATE, pero solo
    -- si nadie depende de ella: un DROP CASCADE a ciegas se llevaria por
    -- delante lo que colgara de la vista.
    RAISE NOTICE '0038: CREATE OR REPLACE fallo (%). Se intenta DROP + CREATE.', SQLERRM;

    SELECT string_agg(DISTINCT dependiente.relname, ', ')
      INTO dependientes
      FROM pg_depend d
      JOIN pg_rewrite r      ON r.oid = d.objid
      JOIN pg_class dependiente ON dependiente.oid = r.ev_class
     WHERE d.refobjid = 'public.v_public_products'::regclass
       AND d.deptype = 'n'
       AND dependiente.relname <> 'v_public_products';

    IF dependientes IS NOT NULL THEN
      RAISE EXCEPTION '0038 ABORTADO: hay objetos que dependen de `v_public_products` (%). Un DROP se los llevaria por delante. Hay que revisarlos a mano.', dependientes;
    END IF;

    EXECUTE 'DROP VIEW public.v_public_products';
    EXECUTE 'CREATE VIEW public.v_public_products AS ' || cuerpo;
    RAISE NOTICE '0038: recreada con DROP + CREATE.';
  END;

  -- ---------------------------------------------------------------------
  -- Y AHORA SE COMPRUEBA. Que la orden no diera error no basta: lo que
  -- importa es lo que quedo guardado.
  --
  -- Los espacios se aplastan y se aceptan los dos ordenes del igual
  -- (`a = b` y `b = a`) porque PostgreSQL reescribe la definicion a su
  -- manera y no promete conservar la forma en que se escribio.
  -- ---------------------------------------------------------------------
  definicion := regexp_replace(pg_get_viewdef('public.v_public_products'::regclass, true), '\s+', ' ', 'g');

  IF definicion NOT LIKE '%DISTINCT ON%' THEN
    RAISE EXCEPTION '0038 FALLO: la vista quedo sin DISTINCT ON. Definicion: %', definicion;
  END IF;

  IF NOT (definicion LIKE '%pli.company_id = p.company_id%'
       OR definicion LIKE '%p.company_id = pli.company_id%') THEN
    RAISE EXCEPTION '0038 FALLO: la vista quedo sin atar el renglon de tarifa a la empresa del producto. Definicion: %', definicion;
  END IF;

  IF NOT (definicion LIKE '%pl.company_id = p.company_id%'
       OR definicion LIKE '%p.company_id = pl.company_id%') THEN
    RAISE EXCEPTION '0038 FALLO: la vista quedo sin atar la tarifa a la empresa del producto. Definicion: %', definicion;
  END IF;

  IF definicion NOT LIKE '%pli.deleted_at IS NULL%' THEN
    RAISE EXCEPTION '0038 FALLO: la vista quedo sin mirar el borrado del renglon de tarifa. Definicion: %', definicion;
  END IF;

  RAISE NOTICE '0038: COMPROBADA. La vista lleva las dos igualdades, el borrado del renglon y el DISTINCT ON.';
END $$;
