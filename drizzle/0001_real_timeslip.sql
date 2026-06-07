CREATE VIEW "public"."v_public_categories" AS (
  SELECT id, company_id, name, status, deleted_at
  FROM product_categories
  WHERE status = 'active' AND deleted_at IS NULL
);--> statement-breakpoint
CREATE VIEW "public"."v_public_price_lists" AS (
  SELECT id, company_id, name, is_public, status, deleted_at
  FROM price_lists
  WHERE is_public = true AND status = 'active' AND deleted_at IS NULL
);--> statement-breakpoint
CREATE VIEW "public"."v_public_products" AS (
  SELECT p.id, p.company_id, p.category_id, p.sku, p.name, p.description, pli.price, p.status, p.deleted_at
  FROM products p
  JOIN price_list_items pli ON p.id = pli.product_id
  JOIN price_lists pl ON pli.price_list_id = pl.id
  WHERE p.status = 'active' AND p.deleted_at IS NULL
    AND pl.is_public = true AND pl.status = 'active' AND pl.deleted_at IS NULL
);