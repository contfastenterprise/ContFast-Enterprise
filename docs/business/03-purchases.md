# \# 03 - Purchases Domain

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

# El módulo de Compras administra todo el ciclo de abastecimiento de la empresa.

# 

# Su responsabilidad es gestionar solicitudes de compra, pedidos a suplidores, recepciones de mercancías, facturas de compra, devoluciones y cuentas por pagar.

# 

# Todas las compras deberán ejecutarse mediante Workflows oficiales.

# 

# \---

# 

# \# Objetivos

# 

# El módulo debe permitir:

# 

# \- Gestionar suplidores.

# \- Crear solicitudes de compra.

# \- Crear órdenes de compra.

# \- Recibir mercancías.

# \- Registrar facturas de compra.

# \- Procesar compras mediante OCR.

# \- Registrar gastos asociados.

# \- Registrar devoluciones.

# \- Gestionar cuentas por pagar.

# \- Integrarse con Inventario.

# \- Integrarse con Contabilidad.

# \- Integrarse con IA.

# 

# \---

# 

# \# Ciclo de Compras

# 

# Todo proceso sigue el siguiente flujo.

# 

# ```text

# Solicitud de Compra

# 

# ↓

# 

# Aprobación (Opcional)

# 

# ↓

# 

# Orden de Compra

# 

# ↓

# 

# Recepción

# 

# ↓

# 

# Factura del Proveedor

# 

# ↓

# 

# Cuenta por Pagar

# 

# ↓

# 

# Pago

# 

# ↓

# 

# Cierre

# ```

# 

# Dependiendo de la empresa, algunos pasos pueden omitirse.

# 

# \---

# 

# \# Tipos de Documentos

# 

# \## Solicitud de Compra

# 

# Documento interno.

# 

# No afecta inventario.

# 

# No genera obligaciones.

# 

# \---

# 

# \## Orden de Compra

# 

# Compromiso con el suplidor.

# 

# No aumenta inventario.

# 

# Puede generar múltiples recepciones.

# 

# \---

# 

# \## Recepción

# 

# Confirma la llegada física de la mercancía.

# 

# Actualiza inventario.

# 

# Puede ser parcial.

# 

# \---

# 

# \## Factura de Compra

# 

# Documento fiscal del suplidor.

# 

# Genera cuentas por pagar.

# 

# Puede originarse mediante OCR.

# 

# \---

# 

# \## Devolución al Suplidor

# 

# Reduce inventario.

# 

# Reduce la deuda.

# 

# Siempre referencia una compra o recepción.

# 

# \---

# 

# \# Estados

# 

# \## Solicitud

# 

# Borrador

# 

# Pendiente

# 

# Aprobada

# 

# Rechazada

# 

# Cancelada

# 

# \---

# 

# \## Orden

# 

# Borrador

# 

# Pendiente

# 

# Aprobada

# 

# Enviada

# 

# Parcialmente Recibida

# 

# Completada

# 

# Cancelada

# 

# \---

# 

# \## Recepción

# 

# Pendiente

# 

# Parcial

# 

# Completada

# 

# Cancelada

# 

# \---

# 

# \## Factura

# 

# Pendiente

# 

# Registrada

# 

# Pagada Parcialmente

# 

# Pagada

# 

# Anulada

# 

# \---

# 

# \# Validaciones

# 

# Antes de crear una orden.

# 

# El suplidor debe estar activo.

# 

# Debe existir al menos una línea.

# 

# Las cantidades deben ser mayores que cero.

# 

# Los productos deben existir.

# 

# \---

# 

# \# Recepción

# 

# La recepción puede ser:

# 

# Total.

# 

# Parcial.

# 

# Múltiple.

# 

# Una misma orden puede generar varias recepciones.

# 

# Nunca recibir más cantidad que la ordenada, salvo que la política de la empresa lo permita.

# 

# \---

# 

# \# Actualización de Inventario

# 

# La recepción genera:

# 

# Entrada de inventario.

# 

# Movimiento de almacén.

# 

# Actualización de existencias.

# 

# Actualización del costo.

# 

# Publicación de eventos.

# 

# La orden de compra no modifica inventario.

# 

# \---

# 

# \# Factura de Compra

# 

# Toda factura conserva:

# 

# Proveedor.

# 

# Moneda.

# 

# Tasa de cambio.

# 

# Impuestos.

# 

# Comprobante fiscal.

# 

# Fecha.

# 

# Total.

# 

# Estado.

# 

# \---

# 

# \# OCR

# 

# El sistema puede registrar compras mediante OCR.

# 

# Flujo.

# 

# ```text

# Imagen

# 

# ↓

# 

# OCR

# 

# ↓

# 

# Extracción

# 

# ↓

# 

# Normalización

# 

# ↓

# 

# Validación

# 

# ↓

# 

# Vista Previa

# 

# ↓

# 

# Confirmación Usuario

# 

# ↓

# 

# Workflow de Registro

# ```

# 

# Nunca registrar automáticamente una factura OCR.

# 

# Siempre requiere confirmación.

# 

# \---

# 

# \# Monedas

# 

# Toda compra conserva:

# 

# Moneda original.

# 

# Tasa de cambio.

# 

# Moneda base.

# 

# Nunca recalcular compras históricas.

# 

# \---

# 

# \# Costos

# 

# El costo puede actualizarse según la política de inventario.

# 

# Ejemplos.

# 

# Costo Promedio.

# 

# FIFO.

# 

# LIFO (si la empresa lo utiliza).

# 

# Costo Estándar.

# 

# La estrategia se configura por empresa.

# 

# \---

# 

# \# Gastos Asociados

# 

# Una compra puede incluir:

# 

# Flete.

# 

# Seguro.

# 

# Aduanas.

# 

# Impuestos no recuperables.

# 

# Otros cargos.

# 

# Estos gastos pueden distribuirse entre los productos recibidos.

# 

# \---

# 

# \# Cuentas por Pagar

# 

# Toda factura de compra genera una cuenta por pagar.

# 

# Los pagos actualizan automáticamente el saldo.

# 

# Nunca permitir pagos superiores al balance pendiente.

# 

# \---

# 

# \# Integración con Inventario

# 

# La recepción de mercancía genera:

# 

# Entrada de inventario.

# 

# Actualización de costos.

# 

# Eventos.

# 

# Auditoría.

# 

# \---

# 

# \# Integración con Contabilidad

# 

# Toda compra genera los asientos contables correspondientes.

# 

# El módulo de Compras nunca registra asientos directamente.

# 

# \---

# 

# \# Integración con IA

# 

# La IA puede:

# 

# Crear órdenes de compra.

# 

# Buscar suplidores.

# 

# Buscar productos.

# 

# Registrar compras mediante OCR.

# 

# Sugerir reposiciones.

# 

# Detectar anomalías.

# 

# Comparar precios históricos.

# 

# Nunca aprobar compras sin permisos.

# 

# \---

# 

# \# Eventos

# 

# El módulo publica:

# 

# PurchaseRequestCreated

# 

# PurchaseApproved

# 

# PurchaseOrderCreated

# 

# PurchaseOrderSent

# 

# PurchaseReceived

# 

# PurchaseInvoiceRegistered

# 

# PurchaseReturnCreated

# 

# AccountsPayableCreated

# 

# PurchasePaid

# 

# SupplierPriceChanged

# 

# \---

# 

# \# Workflows

# 

# CreatePurchaseRequestWorkflow

# 

# ApprovePurchaseWorkflow

# 

# CreatePurchaseOrderWorkflow

# 

# ReceivePurchaseWorkflow

# 

# RegisterPurchaseInvoiceWorkflow

# 

# RegisterPurchaseOCRWorkflow

# 

# CreatePurchaseReturnWorkflow

# 

# RegisterSupplierPaymentWorkflow

# 

# \---

# 

# \# Capacidades (Capabilities)

# 

# create\_purchase\_request

# 

# approve\_purchase

# 

# create\_purchase\_order

# 

# receive\_purchase

# 

# register\_purchase\_invoice

# 

# register\_purchase\_ocr

# 

# register\_supplier\_payment

# 

# create\_purchase\_return

# 

# compare\_supplier\_prices

# 

# search\_purchase

# 

# \---

# 

# \# Herramientas IA

# 

# createPurchaseRequestTool

# 

# createPurchaseOrderTool

# 

# receivePurchaseTool

# 

# registerPurchaseInvoiceTool

# 

# processPurchaseOCRTool

# 

# registerSupplierPaymentTool

# 

# createPurchaseReturnTool

# 

# compareSupplierPricesTool

# 

# searchPurchaseTool

# 

# \---

# 

# \# KPIs

# 

# Compras del día.

# 

# Compras del mes.

# 

# Compras por suplidor.

# 

# Tiempo promedio de entrega.

# 

# Órdenes pendientes.

# 

# Recepciones parciales.

# 

# Facturas pendientes de pago.

# 

# Costo promedio de compras.

# 

# Variación de precios.

# 

# Top suplidores.

# 

# \---

# 

# \# Auditoría

# 

# Toda operación registra:

# 

# Usuario.

# 

# Empresa.

# 

# Sucursal.

# 

# Documento.

# 

# Proveedor.

# 

# Eventos.

# 

# Proveedor IA.

# 

# Tokens utilizados.

# 

# Tiempo de ejecución.

# 

# \---

# 

# \# Reglas Obligatorias

# 

# Nunca eliminar compras registradas.

# 

# Toda recepción actualiza inventario.

# 

# Toda factura genera cuentas por pagar.

# 

# Toda compra utiliza Workflows.

# 

# Toda operación genera eventos.

# 

# Toda operación queda auditada.

# 

# \---

# 

# \# Declaración Final

# 

# El módulo de Compras constituye el dominio oficial de abastecimiento del ERP.

# 

# Todas las operaciones relacionadas con adquisiciones, recepciones, costos y obligaciones con suplidores deberán respetar las reglas definidas en este documento y coordinarse con Inventario, Contabilidad, Facturación Electrónica e Inteligencia Artificial mediante Workflows, Eventos y Capacidades.

