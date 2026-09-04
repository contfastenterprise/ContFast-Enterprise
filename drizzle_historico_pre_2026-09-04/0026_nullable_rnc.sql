ALTER TABLE public.customers ALTER COLUMN rnc_cedula DROP NOT NULL;
ALTER TABLE public.suppliers ALTER COLUMN rnc DROP NOT NULL;
UPDATE public.customers SET rnc_cedula = NULL WHERE rnc_cedula = '';
UPDATE public.suppliers SET rnc = NULL WHERE rnc = '';
