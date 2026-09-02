-- ============================================================================
--  Renglones de tarifa mal sellados  --  para el editor SQL de Supabase
-- ============================================================================
--
--  POR QUE EXISTE
--  --------------
--  La 0038 arregla `v_public_products` atando la union a una sola empresa. Eso
--  hace que un renglon de tarifa de la empresa B que apunta a un producto de la
--  empresa A deje de salir en el catalogo de A.
--
--  Pero la vista TAPA la fila; no la cura. La fila mal sellada sigue en
--  `price_list_items`, y si nadie la mira se queda ahi para siempre. Ese es el
--  patron que esta auditoria lleva toda la sesion persiguiendo: un filtro que
--  esconde el sintoma y deja la causa. El filtro hace falta -- un catalogo
--  publico no puede enseñar el precio de otra empresa -- pero tiene que venir
--  acompañado de esto.
--
--  No cambia nada. Solo lee.
--
--  QUE HACER CON LO QUE SALGA
--  --------------------------
--  Si `a_total` sale 0: no hay nada que arreglar y la 0032 se puede aplicar sin
--  sorpresas (sus claves foraneas compuestas validarian sin quejarse).
--
--  Si sale mas de 0: cada fila listada es una decision, no un borrado
--  automatico. Hay que mirar de quien es de verdad ese renglon -- si el sello
--  esta mal (se corrige `company_id`) o si el renglon nunca debio existir (se
--  borra). Por eso este fichero no trae UPDATE ni DELETE: sellar mal en la
--  direccion contraria es igual de malo.
-- ============================================================================

SELECT json_build_object(

  -- Renglones de tarifa cuya empresa no coincide con la del producto.
  'a_total_renglon_vs_producto', (
    SELECT count(*) FROM price_list_items pli
      JOIN products p ON p.id = pli.product_id
     WHERE pli.company_id <> p.company_id),

  -- Renglones cuya empresa no coincide con la de la tarifa a la que pertenecen.
  'b_total_renglon_vs_tarifa', (
    SELECT count(*) FROM price_list_items pli
      JOIN price_lists pl ON pl.id = pli.price_list_id
     WHERE pli.company_id <> pl.company_id),

  -- Y el caso que de verdad se publicaba: producto y tarifa de empresas
  -- distintas, con la tarifa marcada como publica. Esto es lo que un catalogo
  -- abierto habria enseñado.
  'c_de_esos_los_que_se_publicaban', (
    SELECT count(*) FROM price_list_items pli
      JOIN products p    ON p.id  = pli.product_id
      JOIN price_lists pl ON pl.id = pli.price_list_id
     WHERE p.company_id <> pl.company_id
       AND pl.is_public = true AND pl.status = 'active' AND pl.deleted_at IS NULL
       AND p.status = 'active' AND p.deleted_at IS NULL
       AND pli.deleted_at IS NULL),

  -- El detalle, para decidir uno por uno. Se limita a 50: si hay mas, el
  -- problema es de otro tamaño y toca hablarlo antes de tocar nada.
  'd_detalle', COALESCE((
    SELECT json_agg(x) FROM (
      SELECT pli.id                AS renglon,
             pli.company_id        AS empresa_del_renglon,
             p.company_id          AS empresa_del_producto,
             pl.company_id         AS empresa_de_la_tarifa,
             p.sku, p.name         AS producto,
             pl.name               AS tarifa,
             pl.is_public          AS tarifa_publica,
             pli.price,
             pli.deleted_at IS NOT NULL AS renglon_borrado
        FROM price_list_items pli
        JOIN products p     ON p.id  = pli.product_id
        JOIN price_lists pl ON pl.id = pli.price_list_id
       WHERE pli.company_id <> p.company_id
          OR pli.company_id <> pl.company_id
          OR p.company_id   <> pl.company_id
       ORDER BY pl.is_public DESC, pli.created_at
       LIMIT 50) x), '[]'::json),

  -- Contexto: si la 0032 ya esta aplicada, esto no puede volver a pasar de
  -- ahora en adelante. Si no lo esta, la puerta sigue abierta para filas
  -- nuevas y el arreglo de la vista es solo un parche en la salida.
  'e_claves_compuestas_de_price_list_items', COALESCE((
    SELECT json_agg(json_build_object('nombre', conname, 'validada', convalidated))
      FROM pg_constraint
     WHERE conrelid = 'price_list_items'::regclass AND contype = 'f'
       AND conname LIKE '%_company_fk'), '[]'::json),

  -- Y comprobar que la vista lleva de verdad el arreglo puesto.
  'f_vista_atada_por_empresa', (
    SELECT pg_get_viewdef('v_public_products'::regclass, true) LIKE '%pli.company_id = p.company_id%')

) AS tarifas_cruzadas;
