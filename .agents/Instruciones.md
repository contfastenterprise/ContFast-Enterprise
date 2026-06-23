1. **Siempre utiliza pnpm** para instalar dependencias y ejecutar scripts. No uses npm ni yarn.
2. **Manejo de Base de Datos:**
   - Antes de iniciar cualquier desarrollo, verifica el estado actual de las migraciones con `npx drizzle-kit status`.
   - Solo crea migraciones después de verificar y aprobar el esquema con el usuario.
   - Las migraciones deben ser creadas usando `npx drizzle-kit generate` y revisadas minuciosamente antes de aplicarlas.
    