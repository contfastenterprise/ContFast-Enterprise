# \# 01 - Business Rules

# 

# \*\*Proyecto:\*\* ERP AI Platform

# 

# \*\*Versión:\*\* 1.0

# 

# \*\*Estado:\*\* Oficial

# 

# \---

# 

# \# Introducción

# 

# Este documento define todas las reglas oficiales del negocio del ERP AI Platform.

# 

# Las reglas aquí descritas representan el comportamiento esperado del sistema.

# 

# Estas reglas tienen prioridad sobre cualquier implementación técnica.

# 

# Si existe una diferencia entre el código y este documento, el código deberá corregirse.

# 

# \---

# 

# \# Objetivo

# 

# Garantizar que todas las operaciones del ERP se comporten de forma consistente.

# 

# Estas reglas serán utilizadas por:

# 

# \- Desarrolladores

# \- Inteligencia Artificial

# \- QA

# \- Auditores

# \- Documentación

# \- Clientes Empresariales

# 

# \---

# 

# \# Principios del Negocio

# 

# Toda operación debe cumplir los siguientes principios.

# 

# \## Integridad

# 

# Nunca perder información.

# 

# Los registros históricos jamás deben eliminarse físicamente.

# 

# \---

# 

# \## Trazabilidad

# 

# Toda operación debe poder rastrearse.

# 

# Debe conocerse:

# 

# \- Quién realizó la acción.

# \- Cuándo.

# \- Desde dónde.

# \- Sobre qué entidad.

# \- Resultado.

# 

# \---

# 

# \## Consistencia

# 

# Todas las operaciones deben mantener el negocio en un estado válido.

# 

# No pueden existir datos inconsistentes.

# 

# \---

# 

# \## Auditoría

# 

# Toda operación importante debe registrarse.

# 

# Nunca puede deshabilitarse.

# 

# \---

# 

# \## Seguridad

# 

# Todo acceso requiere permisos.

# 

# No existen excepciones.

# 

# \---

# 

# \## Idempotencia

# 

# Una misma operación no debe ejecutarse dos veces accidentalmente.

# 

# \---

# 

# \# Empresas

# 

# El sistema soporta múltiples empresas.

# 

# Cada empresa posee información completamente independiente.

# 

# Los datos nunca deben mezclarse entre empresas.

# 

# Toda consulta debe filtrarse por empresa.

# 

# \---

# 

# \# Sucursales

# 

# Cada empresa puede tener múltiples sucursales.

# 

# Cada documento pertenece a una sucursal.

# 

# Las numeraciones pueden ser independientes.

# 

# \---

# 

# \# Usuarios

# 

# Todo usuario pertenece a una empresa.

# 

# Puede tener acceso a una o varias sucursales.

# 

# Todo usuario posee:

# 

# \- Roles

# \- Permisos

# \- Preferencias

# \- Auditoría

# 

# \---

# 

# \# Roles

# 

# Los roles agrupan permisos.

# 

# Nunca contienen lógica.

# 

# Ejemplos.

# 

# Administrador

# 

# Ventas

# 

# Compras

# 

# Inventario

# 

# Caja

# 

# Contabilidad

# 

# Supervisor

# 

# Técnico

# 

# \---

# 

# \# Permisos

# 

# Todo permiso representa una capacidad específica.

# 

# Ejemplo.

# 

# invoice.create

# 

# invoice.cancel

# 

# customer.create

# 

# purchase.approve

# 

# inventory.adjust

# 

# Nunca utilizar permisos genéricos.

# 

# \---

# 

# \# Catálogos

# 

# Los catálogos representan información reutilizable.

# 

# Ejemplos.

# 

# Países

# 

# Ciudades

# 

# Monedas

# 

# Impuestos

# 

# Unidades

# 

# Métodos de Pago

# 

# Bancos

# 

# Tipos de Documento

# 

# Los catálogos pueden ser:

# 

# Globales.

# 

# Empresariales.

# 

# \---

# 

# \# Clientes

# 

# Un cliente puede:

# 

# Comprar.

# 

# Recibir cotizaciones.

# 

# Poseer múltiples direcciones.

# 

# Poseer múltiples contactos.

# 

# Poseer historial.

# 

# Poseer límite de crédito.

# 

# Poseer balance pendiente.

# 

# Nunca eliminar clientes con movimientos.

# 

# \---

# 

# \# Suplidores

# 

# Un suplidor puede:

# 

# Recibir órdenes.

# 

# Registrar compras.

# 

# Tener múltiples contactos.

# 

# Tener condiciones de pago.

# 

# Tener historial.

# 

# Nunca eliminar suplidores con movimientos.

# 

# \---

# 

# \# Productos

# 

# Todo producto posee.

# 

# Código.

# 

# Nombre.

# 

# Categoría.

# 

# Unidad.

# 

# Estado.

# 

# Impuestos.

# 

# Código de Barras.

# 

# QR.

# 

# Existencia.

# 

# Costo.

# 

# Precio.

# 

# Puede manejar:

# 

# Lotes.

# 

# Series.

# 

# Variantes.

# 

# Servicios.

# 

# Combos.

# 

# \---

# 

# \# Inventario

# 

# Todo movimiento genera historial.

# 

# Nunca modificar existencias manualmente.

# 

# Todo cambio debe generar un movimiento.

# 

# Tipos.

# 

# Entrada.

# 

# Salida.

# 

# Transferencia.

# 

# Ajuste.

# 

# Reserva.

# 

# Liberación.

# 

# \---

# 

# \# Compras

# 

# Toda compra posee.

# 

# Proveedor.

# 

# Fecha.

# 

# Estado.

# 

# Detalle.

# 

# Impuestos.

# 

# Moneda.

# 

# Tasa de Cambio.

# 

# Total.

# 

# Una compra puede:

# 

# Aprobarse.

# 

# Recibirse.

# 

# Cancelarse.

# 

# Nunca eliminar compras aprobadas.

# 

# \---

# 

# \# Ventas

# 

# Toda venta posee.

# 

# Cliente.

# 

# Productos.

# 

# Impuestos.

# 

# Moneda.

# 

# Estado.

# 

# Pagos.

# 

# Balance.

# 

# Una venta puede.

# 

# Facturarse.

# 

# Anularse.

# 

# Pagarse.

# 

# Nunca modificar una factura emitida.

# 

# \---

# 

# \# Facturación Electrónica

# 

# Toda factura debe cumplir las normas de la DGII.

# 

# Toda factura electrónica posee:

# 

# NCF.

# 

# Estado.

# 

# XML.

# 

# Respuesta DGII.

# 

# Fecha de Envío.

# 

# Fecha de Aceptación.

# 

# Una factura aceptada nunca puede modificarse.

# 

# \---

# 

# \# Notas de Crédito

# 

# Solo pueden emitirse sobre documentos válidos.

# 

# Reducen el balance.

# 

# Actualizan inventario cuando corresponda.

# 

# Generan nuevos eventos.

# 

# \---

# 

# \# Notas de Débito

# 

# Incrementan el balance.

# 

# Nunca modifican la factura original.

# 

# Generan documento independiente.

# 

# \---

# 

# \# Pagos

# 

# Todo pago debe indicar.

# 

# Método.

# 

# Monto.

# 

# Fecha.

# 

# Usuario.

# 

# Referencia.

# 

# Puede aplicarse parcialmente.

# 

# Nunca superar el balance pendiente.

# 

# \---

# 

# \# Cuentas por Cobrar

# 

# Toda factura a crédito genera una cuenta por cobrar.

# 

# Los pagos actualizan automáticamente el balance.

# 

# \---

# 

# \# Cuentas por Pagar

# 

# Toda compra genera una cuenta por pagar.

# 

# Los pagos disminuyen el saldo.

# 

# \---

# 

# \# Monedas

# 

# El sistema soporta múltiples monedas.

# 

# Toda transacción conserva:

# 

# Moneda original.

# 

# Tasa de Cambio.

# 

# Moneda Base.

# 

# Nunca recalcular documentos históricos.

# 

# \---

# 

# \# Impuestos

# 

# Los impuestos pertenecen al documento.

# 

# No al producto.

# 

# Aunque el producto tenga un impuesto por defecto.

# 

# Siempre se copia al documento.

# 

# Esto evita modificar documentos históricos.

# 

# \---

# 

# \# Numeraciones

# 

# Cada documento posee.

# 

# Serie.

# 

# Secuencia.

# 

# Empresa.

# 

# Sucursal.

# 

# Tipo.

# 

# Las numeraciones nunca retroceden.

# 

# \---

# 

# \# Estados

# 

# Todo documento tiene un estado.

# 

# Ejemplo.

# 

# Borrador.

# 

# Pendiente.

# 

# Aprobado.

# 

# Procesado.

# 

# Cancelado.

# 

# Anulado.

# 

# Finalizado.

# 

# Nunca saltar estados.

# 

# \---

# 

# \# Eliminación

# 

# Regla general.

# 

# Nunca eliminar información con movimientos.

# 

# Utilizar.

# 

# Estado.

# 

# Archivado.

# 

# Anulado.

# 

# Inactivo.

# 

# Solo eliminar registros sin dependencias.

# 

# \---

# 

# \# Auditoría

# 

# Registrar.

# 

# Usuario.

# 

# Empresa.

# 

# Sucursal.

# 

# Fecha.

# 

# Acción.

# 

# Entidad.

# 

# Cambios.

# 

# Proveedor IA.

# 

# Tiempo.

# 

# Resultado.

# 

# \---

# 

# \# Inteligencia Artificial

# 

# La IA debe respetar exactamente las mismas reglas del negocio.

# 

# No existen privilegios especiales.

# 

# La IA nunca puede:

# 

# Modificar datos directamente.

# 

# Ignorar permisos.

# 

# Inventar información.

# 

# Omitir auditoría.

# 

# \---

# 

# \# Eventos

# 

# Toda operación importante genera eventos.

# 

# InvoiceCreated

# 

# PurchaseReceived

# 

# InventoryAdjusted

# 

# PaymentRegistered

# 

# CustomerCreated

# 

# RepairCompleted

# 

# \---

# 

# \# Workflows

# 

# Toda operación importante pasa por un Workflow.

# 

# Nunca modificar información directamente.

# 

# \---

# 

# \# Reglas de Integridad

# 

# Nunca:

# 

# Eliminar facturas.

# 

# Eliminar compras.

# 

# Eliminar movimientos inventario.

# 

# Eliminar pagos.

# 

# Eliminar auditorías.

# 

# Eliminar eventos.

# 

# La historia del negocio es permanente.

# 

# \---

# 

# \# Reglas de Rendimiento

# 

# Las reglas del negocio nunca deben sacrificarse por rendimiento.

# 

# Si existe conflicto.

# 

# La integridad tiene prioridad.

# 

# \---

# 

# \# Reglas para IA

# 

# Toda IA debe:

# 

# Consultar documentación.

# 

# Respetar permisos.

# 

# Utilizar Tools.

# 

# Ejecutar Workflows.

# 

# Explicar acciones.

# 

# Solicitar confirmación cuando exista riesgo.

# 

# Nunca asumir datos.

# 

# \---

# 

# \# Declaración Final

# 

# Las reglas contenidas en este documento representan el contrato funcional oficial del ERP AI Platform.

# 

# Todo módulo, Workflow, agente de IA e integración debe respetarlas.

# 

# La arquitectura puede evolucionar.

# 

# La tecnología puede cambiar.

# 

### Pero las reglas del negocio constituyen el núcleo permanente del sistema.

