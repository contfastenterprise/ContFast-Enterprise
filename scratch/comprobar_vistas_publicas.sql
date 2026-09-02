SELECT json_build_object(
  -- 1. ¿La vista lleva el arreglo puesto?
  'a_ata_el_renglon',  (SELECT pg_get_viewdef('v_public_products'::regclass, true) LIKE '%pli.company_id = p.company_id%'),
  'b_ata_la_tarifa',   (SELECT pg_get_viewdef('v_public_products'::regclass, true) LIKE '%pl.company_id = p.company_id%'),
  'c_mira_el_borrado', (SELECT pg_get_viewdef('v_public_products'::regclass, true) LIKE '%pli.deleted_at IS NULL%'),
  'd_un_renglon_por_producto', (SELECT pg_get_viewdef('v_public_products'::regclass, true) LIKE '%DISTINCT ON%'),

  -- 2. ¿Sigue devolviendo lo que debe? Y ya sin duplicados.
  'e_productos_publicados', (SELECT count(*) FROM v_public_products),
  'f_duplicados_DEBE_SER_0', (SELECT count(*) FROM (
      SELECT id FROM v_public_products GROUP BY id HAVING count(*) > 1) x),

  -- 3. Lo que la vista TAPA pero sigue en la base: filas mal selladas.
  'g_renglones_mal_sellados', (SELECT count(*) FROM price_list_items pli
      JOIN products p ON p.id = pli.product_id WHERE pli.company_id <> p.company_id),
  'h_renglon_vs_tarifa',     (SELECT count(*) FROM price_list_items pli
      JOIN price_lists pl ON pl.id = pli.price_list_id WHERE pli.company_id <> pl.company_id),
  'i_producto_vs_tarifa',    (SELECT count(*) FROM price_list_items pli
      JOIN products p ON p.id = pli.product_id
      JOIN price_lists pl ON pl.id = pli.price_list_id WHERE p.company_id <> pl.company_id),

  -- 4. Si hay algo, el detalle para decidir una por una.
  'j_detalle', COALESCE((SELECT json_agg(x) FROM (
      SELECT pli.id AS renglon, pli.company_id AS empresa_renglon,
             p.company_id AS empresa_producto, pl.company_id AS empresa_tarifa,
             p.sku, p.name AS producto, pl.name AS tarifa, pl.is_public, pli.price
        FROM price_list_items pli
        JOIN products p ON p.id = pli.product_id
        JOIN price_lists pl ON pl.id = pli.price_list_id
       WHERE pli.company_id <> p.company_id OR pli.company_id <> pl.company_id OR p.company_id <> pl.company_id
       ORDER BY pl.is_public DESC LIMIT 50) x), '[]'::json)
) AS comprobacion_0038;
