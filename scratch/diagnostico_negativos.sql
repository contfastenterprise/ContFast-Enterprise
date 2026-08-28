-- diagnostico_negativos.sql
--
-- Antes de decidir a que cuenta se imputa el faltante hay que saber QUE es.
-- Dos historias distintas llevan a asientos opuestos:
--
--   a) La mercancia salio de verdad contra despachos facturados y nunca se
--      registro la entrada  ->  es costo de ventas no reconocido.
--
--   b) El inventario nunca se cargo al sistema  ->  NO hay perdida. Es un saldo
--      de apertura que falta, y registrarlo como gasto subvaluaria el activo e
--      inflaria el gasto ante la DGII.
--
-- Esta consulta mira el kardex de cada producto en negativo y las separa.
-- No modifica nada.

WITH negativos AS (
  SELECT l.company_id, l.modo, l.product_id, l.warehouse_id, l.quantity AS nivel
  FROM inventory_levels l
  WHERE l.quantity < 0
),
mov AS (
  SELECT
    m.product_id, m.warehouse_id, m.company_id, m.modo,
    count(*)                                                   AS movimientos,
    min(m.created_at)::date                                    AS primer_mov,
    max(m.created_at)::date                                    AS ultimo_mov,
    sum(CASE WHEN m.quantity > 0 THEN m.quantity ELSE 0 END)    AS total_entradas,
    sum(CASE WHEN m.quantity < 0 THEN -m.quantity ELSE 0 END)   AS total_salidas,
    count(*) FILTER (WHERE m.type = 'purchase')                 AS n_compras,
    count(*) FILTER (WHERE m.type = 'sale')                     AS n_ventas,
    count(*) FILTER (WHERE m.type = 'adjustment')               AS n_ajustes
  FROM inventory_movements m
  GROUP BY 1,2,3,4
)
SELECT
  p.sku,
  p.name                                    AS producto,
  n.nivel                                   AS nivel_actual,
  coalesce(mv.movimientos, 0)               AS movs,
  coalesce(mv.total_entradas, 0)            AS entradas,
  coalesce(mv.total_salidas, 0)             AS salidas,
  coalesce(mv.n_compras, 0)                 AS compras,
  coalesce(mv.n_ventas, 0)                  AS ventas,
  mv.primer_mov,
  mv.ultimo_mov,
  CASE
    WHEN mv.movimientos IS NULL           THEN 'SIN KARDEX: el nivel se puso a mano o migrado'
    WHEN coalesce(mv.n_compras,0) = 0
     AND coalesce(mv.n_ventas,0) > 0      THEN 'SOLO SALIDAS: falta la carga inicial'
    WHEN coalesce(mv.total_entradas,0) = 0 THEN 'SIN ENTRADAS: falta la carga inicial'
    ELSE                                        'MIXTO: revisar caso por caso'
  END                                       AS lectura
FROM negativos n
JOIN products p ON p.id = n.product_id
LEFT JOIN mov mv
       ON mv.product_id = n.product_id
      AND mv.warehouse_id = n.warehouse_id
      AND mv.company_id = n.company_id
      AND mv.modo = n.modo
ORDER BY n.nivel ASC;

-- Resumen de una linea: cuantos productos caen en cada lectura.
WITH negativos AS (
  SELECT l.company_id, l.modo, l.product_id, l.warehouse_id
  FROM inventory_levels l WHERE l.quantity < 0
),
mov AS (
  SELECT m.product_id, m.warehouse_id, m.company_id, m.modo,
         count(*) AS movimientos,
         sum(CASE WHEN m.quantity > 0 THEN m.quantity ELSE 0 END) AS entradas,
         count(*) FILTER (WHERE m.type = 'purchase') AS n_compras,
         count(*) FILTER (WHERE m.type = 'sale')     AS n_ventas
  FROM inventory_movements m GROUP BY 1,2,3,4
)
SELECT
  CASE
    WHEN mv.movimientos IS NULL          THEN 'SIN KARDEX'
    WHEN coalesce(mv.n_compras,0) = 0
     AND coalesce(mv.n_ventas,0) > 0     THEN 'SOLO SALIDAS'
    WHEN coalesce(mv.entradas,0) = 0     THEN 'SIN ENTRADAS'
    ELSE                                      'MIXTO'
  END AS lectura,
  count(*) AS productos
FROM negativos n
LEFT JOIN mov mv
       ON mv.product_id = n.product_id AND mv.warehouse_id = n.warehouse_id
      AND mv.company_id = n.company_id AND mv.modo = n.modo
GROUP BY 1 ORDER BY 2 DESC;
