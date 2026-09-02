-- =====================================================================
-- SEMBRAR LOS PERÍODOS CONTABLES QUE FALTAN A LAS EMPRESAS EXISTENTES
-- =====================================================================
--
-- POR QUÉ HACE FALTA (hallazgo JRN-11)
-- ------------------------------------
-- Hasta ahora el único sitio del código que creaba períodos contables era
-- `isPeriodOpen` —una función cuyo trabajo es COMPROBAR—, y sólo creaba uno,
-- el del mes de la primera operación, y sólo si la empresa tenía cero. A partir
-- de ahí nadie creaba ninguno más: al cambiar de mes la empresa se quedaba sin
-- poder asentar, sin aviso previo y con un error que no decía qué faltaba.
--
-- Le pasó a la empresa 38a1a51e: tenía el período de julio de 2026 y ninguno de
-- agosto. Desde el 1 de agosto no pudo registrar ni una factura ni una compra.
--
-- El código ya no improvisa períodos: las empresas nuevas los reciben al darse
-- de alta. Este guion hace lo mismo con las que ya existen.
--
-- EJECUTAR ANTES DE DESPLEGAR el código nuevo. Si no, cualquier empresa a la
-- que le falte el período del mes en curso quedará bloqueada hasta que alguien
-- lo abra a mano en Contabilidad > Períodos.
--
-- Es idempotente: sólo inserta lo que falta. Se puede volver a ejecutar.
-- =====================================================================


-- ── PASO 1 · Qué empresas están hoy sin período ──────────────────────
SELECT c.name                                    AS empresa,
       m.modo,
       count(p.id)                               AS periodos_totales,
       count(p.id) FILTER (
         WHERE p.status = 'open'
           AND CURRENT_DATE BETWEEN p.start_date AND p.end_date
       )                                         AS abierto_para_hoy,
       max(p.end_date)                           AS ultimo_periodo
FROM companies c
CROSS JOIN (VALUES ('PRODUCCION'::environment_mode), ('PRUEBA'::environment_mode)) AS m(modo)
LEFT JOIN accounting_periods p
       ON p.company_id = c.id AND p.modo = m.modo
WHERE c.deleted_at IS NULL
GROUP BY c.id, c.name, m.modo
ORDER BY abierto_para_hoy, c.name, m.modo;
-- Toda fila con `abierto_para_hoy` = 0 está bloqueada para asentar.


-- ── PASO 2 · Sembrar del mes en curso a diciembre ────────────────────
--
-- Del mes en curso, no desde enero: abrir meses ya pasados invita a asentar
-- hacia atrás en períodos que deberían estar cerrados.
--
-- Los dos entornos: sembrar sólo PRODUCCION deja el de prácticas bloqueado.
INSERT INTO accounting_periods (company_id, modo, name, start_date, end_date, status)
SELECT c.id,
       m.modo,
       to_char(d.mes, 'MM/YYYY'),
       d.mes::date,
       (d.mes + interval '1 month' - interval '1 day')::date,
       'open'
FROM companies c
CROSS JOIN (VALUES ('PRODUCCION'::environment_mode), ('PRUEBA'::environment_mode)) AS m(modo)
CROSS JOIN generate_series(
             date_trunc('month', CURRENT_DATE),
             date_trunc('year',  CURRENT_DATE) + interval '11 months',
             interval '1 month'
           ) AS d(mes)
WHERE c.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM accounting_periods p
     WHERE p.company_id = c.id
       AND p.modo       = m.modo
       AND p.start_date = d.mes::date
  );


-- ── PASO 3 · Comprobación ────────────────────────────────────────────
--
-- `abierto_para_hoy` tiene que ser 1 en TODAS las filas. Si alguna sigue en 0,
-- esa empresa no podrá asentar: mírala una a una antes de desplegar.
SELECT c.name                                    AS empresa,
       m.modo,
       count(p.id)                               AS periodos_totales,
       count(p.id) FILTER (
         WHERE p.status = 'open'
           AND CURRENT_DATE BETWEEN p.start_date AND p.end_date
       )                                         AS abierto_para_hoy,
       max(p.end_date)                           AS ultimo_periodo
FROM companies c
CROSS JOIN (VALUES ('PRODUCCION'::environment_mode), ('PRUEBA'::environment_mode)) AS m(modo)
LEFT JOIN accounting_periods p
       ON p.company_id = c.id AND p.modo = m.modo
WHERE c.deleted_at IS NULL
GROUP BY c.id, c.name, m.modo
ORDER BY abierto_para_hoy, c.name, m.modo;
