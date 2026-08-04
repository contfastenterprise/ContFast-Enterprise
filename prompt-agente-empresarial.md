# Prompt: Módulo "Agente Empresarial" — ContFast Enterprise

Eres un ingeniero de software senior especializado en arquitecturas multi-tenant seguras con Next.js y Supabase. Vas a diseñar e implementar el módulo "Agente Empresarial" para ContFast Enterprise, un sistema de facturación electrónica multiempresa. Escribe código limpio, modular, con manejo de errores explícito y comentarios donde la lógica no sea obvia. No entregues pseudocódigo: todo debe ser funcional y listo para integrar.

## 1. Contexto del sistema existente

- **Producto:** ContFast Enterprise, sistema de facturación electrónica multiempresa basado en el marco normativo e-CF de la DGII (República Dominicana), comprobantes e-31 a e-45.
- **Stack:** Next.js (frontend + API routes), Supabase (Postgres + Auth), desplegado en Vercel (serverless, sin proceso persistente).
- **Multi-tenant:** aislamiento de datos por empresa mediante Row Level Security (RLS) en Supabase, con `company_id` como columna de particionamiento en las tablas relevantes. El contexto de empresa se resuelve al iniciar sesión.
- **Roles existentes:**
  - `cajero`: sin acceso a facturación por defecto.
  - `administrador` y `sistemas`: permisos inmutables (cualquier intento de modificación debe devolver el error `ROLE_PERMISSIONS_IMMUTABLE`).
  - Los demás roles: permisos editables a nivel de rol y de usuario, con prioridad para el permiso a nivel de usuario cuando ambos existen.

## 2. Objetivo del módulo

Construir el **motor de propuestas de negocio** del Agente Empresarial: un componente **analítico, de solo lectura, que nunca ejecuta acciones en el sistema**.

- Analiza datos **agregados y puramente numéricos** (sin nombres de clientes/proveedores, sin RNC, sin ningún identificador) para generar recomendaciones gerenciales.
- Enfoque inicial: **flujo de efectivo** (ingresos, egresos, saldos por período, cuentas por cobrar/pagar vencidas). Diseñar de forma extensible para agregar después producción, compras, ventas y RRHH.
- Solo genera texto con recomendaciones y su justificación numérica — no automatiza ni ejecuta ninguna tarea del sistema (no incluye generación/envío de e-CF ni ningún flujo de aprobación).

## 3. Especificación técnica

### Esquema de base de datos (Supabase)
Diseña, como mínimo, la tabla `agent_proposals`: propuestas analíticas generadas (área, resumen, datos de respaldo, timestamp, `company_id`), con su política RLS respetando el aislamiento por `company_id`.

### Query de agregación (solo números)
Escribe la consulta SQL (o función RPC de Supabase) que extrae únicamente cifras de flujo de efectivo por empresa y período, sin ningún dato identificable de clientes o proveedores.

### Integración con IA (Gemini API)
- Crea una función que reciba los datos agregados en JSON, construya el prompt para la **Gemini API**, y devuelva la propuesta estructurada (resumen, justificación, nivel de confianza o riesgo).
- Maneja la clave de API de forma segura (variable de entorno en Vercel, nunca expuesta al cliente).
- Incluye manejo de errores (timeouts, respuestas mal formadas, límites de tasa excedidos del tier gratuito de Gemini).

### API routes (Next.js)
- Endpoint para generar una propuesta analítica bajo demanda, protegido por sesión y `company_id`.
- Endpoint para listar las propuestas ya generadas de una empresa.

### UI (panel gerencial)
- Vista de propuestas de negocio, agrupadas por área, con su justificación numérica visible.

## 4. Requisitos no funcionales

- Seguridad: validar rol y `company_id` en cada operación del lado del servidor, nunca confiar en el cliente.
- Auditoría: cada aprobación/rechazo debe quedar registrado de forma inmutable (usuario, timestamp, resultado).
- Extensibilidad: el motor de propuestas debe poder agregar nuevas áreas (producción, compras, ventas, RRHH) sin reescribir la lógica central.
- Sin datos sensibles: ningún dato identificable de clientes, proveedores o empleados debe llegar al proveedor de IA — solo cifras agregadas.

## 5. Entregable esperado

Entrega el código completo organizado por archivo (esquema SQL, funciones/RPC, API routes, componentes de UI), con una breve explicación de las decisiones de diseño más importantes al final.
