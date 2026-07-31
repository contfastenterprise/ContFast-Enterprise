# \# 02 - Sales Domain

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

# El módulo de Ventas administra todo el ciclo comercial de la empresa.

# 

# Su responsabilidad es gestionar cotizaciones, pedidos, facturación, cobros, devoluciones y documentos relacionados.

# 

# Este módulo constituye el punto central de generación de ingresos del ERP.

# 

# \---

# 

# \# Objetivos

# 

# El módulo debe permitir:

# 

# \- Gestionar clientes.

# \- Crear cotizaciones.

# \- Crear pedidos.

# \- Emitir facturas.

# \- Facturar servicios.

# \- Facturar productos.

# \- Registrar pagos.

# \- Gestionar créditos.

# \- Emitir notas de crédito.

# \- Emitir notas de débito.

# \- Consultar historial comercial.

# \- Integrarse con Inventario.

# \- Integrarse con Contabilidad.

# \- Integrarse con DGII.

# \- Integrarse con IA.

# 

# \---

# 

# \# Ciclo Comercial

# 

# Todo documento comercial sigue el siguiente flujo.

# 

# ```text

# Cotización

# 

# ↓

# 

# Pedido (Opcional)

# 

# ↓

# 

# Factura

# 

# ↓

# 

# Cobro

# 

# ↓

# 

# Cuenta por Cobrar

# 

# ↓

# 

# Cierre

# ```

# 

# Dependiendo del negocio, algunos pasos pueden omitirse.

# 

# \---

# 

# \# Tipos de Documentos

# 

# \## Cotización

# 

# No afecta inventario.

# 

# No genera movimientos contables.

# 

# Puede convertirse en pedido.

# 

# Puede convertirse en factura.

# 

# \---

# 

# \## Pedido

# 

# Reserva inventario.

# 

# Puede requerir aprobación.

# 

# No genera comprobante fiscal.

# 

# \---

# 

# \## Factura

# 

# Genera venta oficial.

# 

# Puede ser:

# 

# Contado.

# 

# Crédito.

# 

# Mixta.

# 

# \---

# 

# \## Nota de Crédito

# 

# Disminuye el valor de una factura.

# 

# Puede devolver inventario.

# 

# Siempre referencia una factura existente.

# 

# \---

# 

# \## Nota de Débito

# 

# Incrementa el saldo pendiente.

# 

# Siempre genera un documento independiente.

# 

# \---

# 

# \# Estados de una Cotización

# 

# Borrador

# 

# Pendiente

# 

# Aprobada

# 

# Rechazada

# 

# Vencida

# 

# Convertida

# 

# Archivada

# 

# \---

# 

# \# Estados de un Pedido

# 

# Borrador

# 

# Pendiente

# 

# Aprobado

# 

# Reservado

# 

# Facturado

# 

# Cancelado

# 

# \---

# 

# \# Estados de una Factura

# 

# Borrador

# 

# Pendiente

# 

# Emitida

# 

# Aceptada DGII

# 

# Pagada

# 

# Pagada Parcialmente

# 

# Vencida

# 

# Anulada

# 

# \---

# 

# \# Reglas Generales

# 

# Toda factura debe tener un cliente.

# 

# Toda factura debe tener al menos una línea.

# 

# Toda línea debe tener cantidad mayor que cero.

# 

# No existen cantidades negativas.

# 

# No se permiten productos inactivos.

# 

# No se permiten clientes bloqueados.

# 

# No se permite vender fuera del rango de permisos.

# 

# \---

# 

# \# Cliente

# 

# Antes de crear una factura se valida:

# 

# Cliente activo.

# 

# RNC o cédula válido cuando aplique.

# 

# Límite de crédito.

# 

# Balance pendiente.

# 

# Condición de pago.

# 

# Lista de precios.

# 

# Exenciones fiscales.

# 

# \---

# 

# \# Productos

# 

# Antes de vender un producto.

# 

# Debe existir.

# 

# Debe estar activo.

# 

# Debe pertenecer a la empresa.

# 

# Debe tener unidad válida.

# 

# Debe tener impuestos configurados.

# 

# \---

# 

# \# Validación de Inventario

# 

# Si el producto controla existencias.

# 

# ↓

# 

# Validar stock.

# 

# ↓

# 

# Reservar.

# 

# ↓

# 

# Facturar.

# 

# ↓

# 

# Descontar inventario.

# 

# Los servicios no afectan inventario.

# 

# \---

# 

# \# Precios

# 

# El precio puede provenir de:

# 

# Precio base.

# 

# Lista de precios.

# 

# Promoción.

# 

# Contrato comercial.

# 

# Precio manual autorizado.

# 

# Toda modificación queda auditada.

# 

# \---

# 

# \# Descuentos

# 

# Tipos permitidos.

# 

# Por línea.

# 

# Global.

# 

# Por porcentaje.

# 

# Por monto fijo.

# 

# Promocional.

# 

# Todo descuento requiere autorización según políticas de la empresa.

# 

# \---

# 

# \# Impuestos

# 

# Los impuestos se calculan al momento de emitir la factura.

# 

# Una vez emitida.

# 

# Nunca se recalculan.

# 

# \---

# 

# \# Monedas

# 

# Una factura conserva:

# 

# Moneda.

# 

# Tasa de cambio.

# 

# Moneda base.

# 

# Las tasas históricas nunca cambian.

# 

# \---

# 

# \# Pagos

# 

# Una factura puede recibir:

# 

# Pago total.

# 

# Pago parcial.

# 

# Múltiples pagos.

# 

# Múltiples métodos de pago.

# 

# Nunca superar el saldo pendiente.

# 

# \---

# 

# \# Cuenta por Cobrar

# 

# Las ventas a crédito generan automáticamente una cuenta por cobrar.

# 

# El saldo se actualiza con cada pago.

# 

# \---

# 

# \# Facturación Electrónica

# 

# Toda factura fiscal debe:

# 

# Generar XML.

# 

# Validar estructura.

# 

# Enviar a la DGII.

# 

# Registrar respuesta.

# 

# Actualizar estado.

# 

# Guardar evidencia.

# 

# \---

# 

# \# Integración con Inventario

# 

# La emisión de una factura genera:

# 

# Salida de inventario.

# 

# Actualización de existencias.

# 

# Actualización de costo promedio (según configuración).

# 

# Publicación de eventos.

# 

# \---

# 

# \# Integración con Contabilidad

# 

# Toda factura genera los asientos contables correspondientes mediante el módulo de Contabilidad.

# 

# El módulo de Ventas no registra asientos directamente.

# 

# \---

# 

# \# Integración con IA

# 

# La IA puede:

# 

# Crear borradores.

# 

# Buscar clientes.

# 

# Buscar productos.

# 

# Sugerir promociones.

# 

# Detectar anomalías.

# 

# Responder preguntas comerciales.

# 

# Nunca emitir una factura sin permisos.

# 

# \---

# 

# \# Eventos

# 

# El módulo publica:

# 

# QuotationCreated

# 

# QuotationApproved

# 

# OrderCreated

# 

# OrderReserved

# 

# InvoiceCreated

# 

# InvoicePaid

# 

# InvoiceCanceled

# 

# CreditNoteIssued

# 

# DebitNoteIssued

# 

# SalesPriceOverridden

# 

# CustomerCreditLimitExceeded

# 

# \---

# 

# \# Workflows

# 

# CreateQuotationWorkflow

# 

# ApproveQuotationWorkflow

# 

# ConvertQuotationToOrderWorkflow

# 

# CreateOrderWorkflow

# 

# ReserveInventoryWorkflow

# 

# CreateInvoiceWorkflow

# 

# RegisterPaymentWorkflow

# 

# IssueCreditNoteWorkflow

# 

# IssueDebitNoteWorkflow

# 

# CancelInvoiceWorkflow

# 

# \---

# 

# \# Capacidades (Capabilities)

# 

# create\_quote

# 

# approve\_quote

# 

# create\_order

# 

# reserve\_inventory

# 

# create\_invoice

# 

# register\_payment

# 

# issue\_credit\_note

# 

# issue\_debit\_note

# 

# cancel\_invoice

# 

# search\_invoice

# 

# search\_customer\_sales

# 

# calculate\_taxes

# 

# \---

# 

# \# Herramientas IA

# 

# createQuotationTool

# 

# createOrderTool

# 

# createInvoiceTool

# 

# registerPaymentTool

# 

# cancelInvoiceTool

# 

# issueCreditNoteTool

# 

# issueDebitNoteTool

# 

# searchInvoiceTool

# 

# calculateTaxesTool

# 

# \---

# 

# \# KPIs

# 

# Ventas del día.

# 

# Ventas del mes.

# 

# Ventas por vendedor.

# 

# Ventas por sucursal.

# 

# Margen bruto.

# 

# Facturas pendientes.

# 

# Facturas vencidas.

# 

# Tiempo promedio de cobro.

# 

# Clientes con mayor facturación.

# 

# Productos más vendidos.

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

# Cambios.

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

# Nunca modificar una factura emitida.

# 

# Nunca eliminar facturas.

# 

# Toda venta utiliza un Workflow.

# 

# Toda factura genera eventos.

# 

# Toda venta queda auditada.

# 

# Toda factura fiscal sigue las normas DGII.

# 

# \---

# 

# \# Declaración Final

# 

# El módulo de Ventas constituye el dominio comercial del ERP.

# 

# Toda operación relacionada con ingresos deberá respetar las reglas definidas en este documento y coordinarse con Inventario, Contabilidad, Facturación Electrónica e Inteligencia Artificial mediante Workflows, Eventos y Capacidades.

