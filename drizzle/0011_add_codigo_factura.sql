-- 1. Create sequences table
CREATE TABLE IF NOT EXISTS public.factura_secuencias (
    anio INTEGER PRIMARY KEY,
    ultimo_numero BIGINT NOT NULL DEFAULT 0
);

-- 2. Add codigo_factura column to invoices
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS codigo_factura VARCHAR(50);

-- 3. Create unique index and constraint
CREATE UNIQUE INDEX IF NOT EXISTS invoices_codigo_factura_idx ON public.invoices(codigo_factura);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_codigo_factura_unique UNIQUE USING INDEX invoices_codigo_factura_idx;

-- 4. Create sequence generator function
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

-- 5. Create trigger function
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

-- 6. Create trigger
DROP TRIGGER IF EXISTS trg_assign_codigo_factura ON public.invoices;
CREATE TRIGGER trg_assign_codigo_factura
BEFORE INSERT ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.trg_invoices_assign_codigo_factura();
