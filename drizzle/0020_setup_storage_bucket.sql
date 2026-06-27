-- 1. Crear el bucket 'avatars' si no existe
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars', 
  'avatars', 
  true, 
  3145728, -- 3MB en bytes
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET 
  public = true,
  file_size_limit = 3145728,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

--> statement-breakpoint

-- 2. Eliminar políticas viejas si existen
DROP POLICY IF EXISTS "Permitir lectura pública de avatares" ON storage.objects;
--> statement-breakpoint
DROP POLICY IF EXISTS "Permitir a usuarios subir su propio avatar" ON storage.objects;
--> statement-breakpoint
DROP POLICY IF EXISTS "Permitir a usuarios actualizar su propio avatar" ON storage.objects;
--> statement-breakpoint
DROP POLICY IF EXISTS "Permitir a usuarios eliminar su propio avatar" ON storage.objects;

--> statement-breakpoint

-- 3. Crear políticas RLS seguras
-- Lectura pública para cualquier avatar
CREATE POLICY "Permitir lectura pública de avatares" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'avatars');

--> statement-breakpoint

-- Insertar: solo dentro de su propia carpeta 'avatars/{user-id}'
CREATE POLICY "Permitir a usuarios subir su propio avatar" 
ON storage.objects FOR INSERT 
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' AND 
  (storage.foldername(name))[1] = (select auth.uid())::text
);

--> statement-breakpoint

-- Actualizar: solo su propia carpeta
CREATE POLICY "Permitir a usuarios actualizar su propio avatar" 
ON storage.objects FOR UPDATE 
TO authenticated
USING (
  bucket_id = 'avatars' AND 
  (storage.foldername(name))[1] = (select auth.uid())::text
)
WITH CHECK (
  bucket_id = 'avatars' AND 
  (storage.foldername(name))[1] = (select auth.uid())::text
);

--> statement-breakpoint

-- Eliminar: solo su propio avatar
CREATE POLICY "Permitir a usuarios eliminar su propio avatar" 
ON storage.objects FOR DELETE 
TO authenticated
USING (
  bucket_id = 'avatars' AND 
  (storage.foldername(name))[1] = (select auth.uid())::text
);
