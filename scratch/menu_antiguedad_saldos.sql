-- ═══════════════════════════════════════════════════════════════════════════
--  Antigüedad de Saldos en el menú lateral
-- ═══════════════════════════════════════════════════════════════════════════
--
--  La barra lateral NO está escrita en el código: se arma leyendo
--  `route_mappings` (ver `buildSidebar` en src/utils/rbacHelpers.ts). Así que
--  una pantalla nueva no aparece en el menú hasta que tiene su fila aquí.
--
--  VAN DOS FILAS, NO UNA. Y es a propósito.
--
--  La pantalla tiene dos pestañas que piden módulos distintos: clientes exige
--  `cobros`, suplidores exige `proveedores`. Al mirar tu tabla `role_permissions`
--  resultó que hay roles reales con uno y sin el otro:
--
--      facturacion  ->  cobros: SI      proveedores: NO (granted=false)
--      compras      ->  cobros: NO      proveedores: SI
--
--  Con una sola fila `module='cobros'`, `compras` nunca vería el enlace, aunque
--  la pestaña de suplidores le funciona perfectamente. Con dos filas —misma
--  ruta, un módulo cada una— el menú aparece si el usuario puede abrir AL MENOS
--  UNA de las dos pestañas, que es exactamente la regla correcta.
--
--  ¿Y no salen dos "Antigüedad de Saldos" en el menú para quien tenga los dos
--  permisos? No. `new-app-sidebar.tsx` deduplica por `href` dentro de cada
--  grupo (`seenHrefs`), y las dos filas comparten `route_pattern`, luego
--  comparten `href`. Por eso ambas van con el MISMO `group_name`: si las
--  separas de grupo, la deduplicación ya no las ve juntas y sí saldría dos
--  veces. `route_mappings` no tiene índice único sobre `route_pattern` (solo
--  un índice normal), así que la segunda fila no choca con nada.
--
--  Nota: `route_mappings` hoy SOLO alimenta el menú. El control de acceso real
--  vive en cada API (`/api/v1/cartera` comprueba el módulo según la pestaña),
--  así que estas filas no abren ninguna puerta: solo dejan de esconder una
--  puerta que el usuario ya podía abrir.
--
--  REVISA ANTES DE APLICAR. La decisión del grupo está marcada abajo.
--
--  El `order_index` NO va a un número inventado: se calcula como el siguiente
--  del grupo, para no empujar ni pisar lo que ya tienes ordenado. Las dos filas
--  comparten el mismo valor a propósito — son la misma entrada del menú.
-- ---------------------------------------------------------------------------

-- 1) Mira lo que hay hoy en el grupo, para saber dónde va a caer.
SELECT display_name, route_pattern, module, action, icon_name, order_index
FROM route_mappings
WHERE group_name = 'Finanzas'
ORDER BY order_index NULLS LAST;

-- 2) Comprueba que no exista ya (por si se corrió antes).
--    Debe decir 0. Si dice 1 o 2, ya se aplicó: no vuelvas a correr el paso 3.
SELECT COUNT(*) AS ya_existe
FROM route_mappings
WHERE route_pattern LIKE '/dashboard/antiguedad-saldos%';

-- 3) Las dos filas, de un solo golpe.
INSERT INTO route_mappings
  (route_pattern, module, action, is_menu_item, display_name, group_name, icon_name, order_index)
SELECT
  '/dashboard/antiguedad-saldos%',
  m.modulo,
  'read',
  TRUE,
  'Antigüedad de Saldos',
  -- DECISIÓN — el grupo.
  --   'Finanzas' porque la pantalla cubre lo que te deben Y lo que debes. Si
  --   prefieres verla bajo 'Ingresos', cámbialo aquí Y en el SELECT del paso 1
  --   y en el COALESCE de abajo: los tres tienen que decir lo mismo, o el
  --   order_index se calcula contra un grupo y la fila cae en otro.
  'Finanzas',
  'PieChart',
  COALESCE((SELECT MAX(order_index) FROM route_mappings WHERE group_name = 'Finanzas'), 0) + 1
FROM (VALUES ('cobros'), ('proveedores')) AS m(modulo)
WHERE NOT EXISTS (
  SELECT 1 FROM route_mappings WHERE route_pattern LIKE '/dashboard/antiguedad-saldos%'
);

-- 4) Confirma que quedó: esperas DOS filas, mismo route_pattern, mismo grupo,
--    mismo order_index, y los módulos 'cobros' y 'proveedores'.
SELECT display_name, route_pattern, module, action, group_name, icon_name, order_index
FROM route_mappings
WHERE route_pattern LIKE '/dashboard/antiguedad-saldos%'
ORDER BY module;

-- ---------------------------------------------------------------------------
--  DESHACER, si algo no te cuadra:
--
--  DELETE FROM route_mappings
--  WHERE route_pattern LIKE '/dashboard/antiguedad-saldos%';
-- ---------------------------------------------------------------------------
