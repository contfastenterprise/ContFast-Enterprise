-- Migration: Add indicador_nota_credito column to invoices table
-- This field stores the credit note indicator (1=Anulación, 2=Corrección texto, 3=Corrección montos)
-- required by DGII for e-34 (Nota de Crédito) documents.

ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "indicador_nota_credito" integer;
