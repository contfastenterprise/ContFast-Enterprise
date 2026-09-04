DROP INDEX IF EXISTS "role_permissions_role_perm_idx";
CREATE UNIQUE INDEX "role_permissions_role_perm_idx" ON "role_permissions" USING btree ("company_id","role_id","permission_id");
