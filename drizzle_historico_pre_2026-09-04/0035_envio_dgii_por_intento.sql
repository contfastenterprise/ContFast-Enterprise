-- ============================================================================
--  0035  --  Los envios a la DGII son uno por intento, y hay que poder
--            elegir el correcto sin depender del azar.
-- ============================================================================
--
--  En `dgii_submissions` hay una fila por cada intento de envio de una
--  factura. Los indices que habia -- (company_id), (invoice_id), (status),
--  (company_id, modo) -- sirven para buscar, pero ninguno ordena por fecha
--  dentro de una factura, que es justo lo que hacen ahora las cinco rutas que
--  imprimen el comprobante para quedarse con el envio vigente.
--
--  Este indice es de rendimiento, no de correccion: la correccion esta en el
--  ORDER BY del codigo (src/repositories/dgiiSubmissionRepository.ts).
--
--  LO QUE ESTA MIGRACION NO HACE, A PROPOSITO
--  ------------------------------------------
--  No crea ningun UNIQUE sobre invoice_id. Se penso -- de hecho
--  `submit/route.ts` lleva un `.onConflictDoNothing()` escrito como si
--  existiera, y por eso ese onConflict hoy no hace absolutamente nada -- pero
--  se descarto: obligaria a borrar filas de una tabla fiscal decidiendo cual
--  se queda, y con ellas el motivo de cada rechazo de la DGII. El rastro se
--  conserva.
--
--  Tampoco repara datos. Si el diagnostico (scratch/diagnostico_dgii.sql)
--  encuentra aceptaciones machacadas, esa reparacion va en su propia
--  migracion, revisada aparte y con los datos delante.
-- ============================================================================

CREATE INDEX IF NOT EXISTS "dgii_submissions_invoice_created_idx"
  ON "dgii_submissions" USING btree ("invoice_id", "created_at" DESC);

-- Para `envioEnCurso`: el intento vivo de una factura. Parcial, porque las
-- filas ya cerradas no se buscan nunca por este camino.
CREATE INDEX IF NOT EXISTS "dgii_submissions_en_curso_idx"
  ON "dgii_submissions" USING btree ("invoice_id", "created_at" DESC)
  WHERE "status" IN ('pending', 'processing');
