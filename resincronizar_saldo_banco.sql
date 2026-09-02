-- ============================================================================
--  Resincronizar el saldo REAL antes de arrancar el codigo nuevo
-- ============================================================================
--
--  POR QUE HACE FALTA
--  ------------------
--  La migracion 0036 siembra `bank_account_balances` con el saldo que hay en
--  ese momento. Pero mientras siga corriendo el codigo VIEJO, cada cobro y
--  cada pago siguen escribiendo en `bank_accounts.balance` y NO en la tabla
--  nueva, que se queda quieta.
--
--  Si entre la migracion y el despliegue pasan dias, el saldo de la tabla
--  nueva queda viejo. Comprobado:
--
--      dia 1, tras la migracion ....... catalogo 5.000   tabla nueva 5.000
--      dia 3, el codigo viejo cobra 50.000
--                                       catalogo 55.000  tabla nueva 5.000
--
--  El dia que arranque el codigo nuevo, el saldo del banco daria un salto
--  hacia atras de 50.000.
--
--  CUANDO EJECUTARLO
--  -----------------
--  Justo ANTES de arrancar el codigo nuevo, con el viejo ya parado. Si la
--  migracion y el despliegue van seguidos no cambia nada (sobrescribe con el
--  mismo valor), asi que se puede ejecutar siempre y no hay que acordarse de
--  si hizo falta o no.
--
--  Solo toca PRODUCCION. El saldo de PRUEBA es el de practicas y no tiene por
--  que parecerse al del catalogo.
-- ============================================================================

UPDATE bank_account_balances b
   SET balance = a.balance,
       updated_at = now()
  FROM bank_accounts a
 WHERE b.bank_account_id = a.id
   AND b.modo = 'PRODUCCION'
   AND b.balance IS DISTINCT FROM a.balance;

--  Y por si alguna cuenta se creo despues de la migracion (con el codigo
--  viejo, que no siembra la tabla nueva): se le crean sus dos filas.
INSERT INTO bank_account_balances (company_id, bank_account_id, modo, balance)
SELECT a.company_id, a.id, m.modo, a.balance
  FROM bank_accounts a
 CROSS JOIN (VALUES ('PRODUCCION'::environment_mode), ('PRUEBA'::environment_mode)) AS m(modo)
 WHERE a.deleted_at IS NULL
ON CONFLICT ("bank_account_id", "modo") DO NOTHING;

--  Resultado, para verlo de un vistazo.
SELECT a.bank_name,
       a.account_number,
       a.balance                                        AS catalogo,
       max(b.balance) FILTER (WHERE b.modo = 'PRODUCCION') AS real,
       max(b.balance) FILTER (WHERE b.modo = 'PRUEBA')     AS practicas
  FROM bank_accounts a
  JOIN bank_account_balances b ON b.bank_account_id = a.id
 WHERE a.deleted_at IS NULL
 GROUP BY a.id, a.bank_name, a.account_number, a.balance
 ORDER BY a.bank_name;
