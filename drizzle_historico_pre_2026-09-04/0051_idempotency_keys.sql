-- 0051 — Idempotency-key para rutas POST criticas (P1-11, segunda parte).
--
-- EL PROBLEMA
-- ------------
-- La migracion 0050 agrego un indice unico parcial a financial_movements,
-- pero ese indice solo protege el caso donde un reintento reutiliza un
-- document_id YA EXISTENTE (ej. confirmar el mismo cheque en garantia dos
-- veces). No protege el caso, mas comun, de que un reintento de red o un
-- doble clic vuelva a llamar a la ruta completa y cree una fila nueva
-- (otro pago, otro cobro, otra factura presentada a la DGII) con un id
-- distinto cada vez -- eso ninguna restriccion de esquema existente lo
-- puede detectar por si sola.
--
-- LA CORRECCION
-- --------------
-- Tabla nueva `idempotency_keys`: el cliente (frontend) puede enviar un
-- header `Idempotency-Key` con las rutas POST criticas (pagos, cobros,
-- emision de facturas). La primera vez que se ve una clave se reserva y
-- se ejecuta la operacion; un reintento con la MISMA clave mientras la
-- primera sigue en curso recibe 409; un reintento despues de que la
-- primera termino con exito recibe la MISMA respuesta guardada, sin
-- re-ejecutar nada. Ver `src/lib/idempotency.ts`.
--
-- Es una capa OPCIONAL: si el cliente no manda el header, la ruta se
-- comporta exactamente igual que antes de este cambio -- no rompe
-- clientes existentes que todavia no lo envian.

CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  modo environment_mode NOT NULL DEFAULT 'PRODUCCION',
  route varchar(100) NOT NULL,
  idempotency_key varchar(255) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'processing',
  response_status integer,
  response_body jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  completed_at timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS idem_keys_company_modo_route_key_idx
  ON public.idempotency_keys (company_id, modo, route, idempotency_key);

CREATE INDEX IF NOT EXISTS idem_keys_created_at_idx
  ON public.idempotency_keys (created_at);

COMMENT ON TABLE public.idempotency_keys IS
  'Auditoria P1-11 (2026-09-03). Reserva de claves Idempotency-Key para rutas POST criticas -- ver src/lib/idempotency.ts. Filas viejas se pueden purgar periodicamente (ej. mas de 24h); esta migracion no agrega ese job, solo la tabla.';

-- ── VERIFICACION ────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'idempotency_keys') AS "Tabla idempotency_keys existe (deberia ser 1)",
  (SELECT COUNT(*) FROM public.idempotency_keys) AS "Filas actuales (deberia ser 0 recien aplicada)";
