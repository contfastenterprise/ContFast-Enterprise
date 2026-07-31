##### \# 00 - Master Data

##### 

##### Proyecto: ERP AI Platform

##### 

##### Versión: 1.0

##### 

##### Estado: Oficial

##### 

##### \---

##### 

##### \# Introducción

##### 

##### El Master Data define las entidades maestras del ERP.

##### 

##### Son datos reutilizados por todos los módulos.

##### 

##### Representan la estructura permanente del negocio.

##### 

##### \---

##### 

##### \# Objetivos

##### 

##### Centralizar.

##### 

##### Normalizar.

##### 

##### Reutilizar.

##### 

##### Evitar duplicidad.

##### 

##### Garantizar consistencia.

##### 

##### \---

##### 

##### \# ¿Qué es un Master Data?

##### 

##### Es información compartida.

##### 

##### Ejemplo.

##### 

##### Empresa.

##### 

##### Sucursal.

##### 

##### Usuarios.

##### 

##### Roles.

##### 

##### Permisos.

##### 

##### Monedas.

##### 

##### Impuestos.

##### 

##### Categorías.

##### 

##### Unidades.

##### 

##### Almacenes.

##### 

##### Métodos de Pago.

##### 

##### Bancos.

##### 

##### Países.

##### 

##### Ciudades.

##### 

##### \---

##### 

##### \# Jerarquía

##### 

##### Sistema

##### 

##### ↓

##### 

##### Empresa

##### 

##### ↓

##### 

##### Sucursal

##### 

##### ↓

##### 

##### Departamento

##### 

##### ↓

##### 

##### Usuario

##### 

##### ↓

##### 

##### Roles

##### 

##### ↓

##### 

##### Permisos

##### 

##### \---

##### 

##### \# Empresa

##### 

##### Toda empresa posee.

##### 

##### ID

##### 

##### RNC

##### 

##### Nombre Comercial

##### 

##### Razón Social

##### 

##### Correo

##### 

##### Teléfono

##### 

##### Dirección Fiscal

##### 

##### Configuración Fiscal

##### 

##### Moneda Base

##### 

##### Zona Horaria

##### 

##### Idioma

##### 

##### Estado

##### 

##### Configuraciones IA

##### 

##### Proveedor IA

##### 

##### Modelo IA

##### 

##### \---

##### 

##### \# Sucursales

##### 

##### Cada empresa puede tener múltiples sucursales.

##### 

##### Cada sucursal posee.

##### 

##### Código

##### 

##### Nombre

##### 

##### Dirección

##### 

##### NCF

##### 

##### Almacén Principal

##### 

##### Responsable

##### 

##### Estado

##### 

##### \---

##### 

##### \# Usuarios

##### 

##### Todo usuario pertenece a una empresa.

##### 

##### Puede acceder a varias sucursales.

##### 

##### Posee.

##### 

##### Perfil

##### 

##### Idioma

##### 

##### Zona Horaria

##### 

##### Preferencias

##### 

##### Avatar

##### 

##### Firma

##### 

##### Roles

##### 

##### Permisos

##### 

##### \---

##### 

##### \# Roles

##### 

##### Ejemplos.

##### 

##### Administrador

##### 

##### Gerente

##### 

##### Ventas

##### 

##### Compras

##### 

##### Caja

##### 

##### Contabilidad

##### 

##### Técnico

##### 

##### Supervisor

##### 

##### \---

##### 

##### \# Permisos

##### 

##### Formato oficial.

##### 

##### modulo.recurso.accion

##### 

##### Ejemplos.

##### 

##### sales.invoice.create

##### 

##### sales.invoice.cancel

##### 

##### inventory.adjust.create

##### 

##### customer.update

##### 

##### repair.assign

##### 

##### dgii.submit

##### 

##### ai.chat

##### 

##### \---

##### 

##### \# Monedas

##### 

##### Toda moneda registra.

##### 

##### Código ISO

##### 

##### Símbolo

##### 

##### Nombre

##### 

##### Cantidad de decimales

##### 

##### Formato

##### 

##### Estado

##### 

##### Moneda Base

##### 

##### \---

##### 

##### \# Tasas de Cambio

##### 

##### La tasa nunca modifica documentos históricos.

##### 

##### Cada transacción guarda:

##### 

##### Moneda

##### 

##### Tasa

##### 

##### Fecha

##### 

##### Origen

##### 

##### \---

##### 

##### \# Impuestos

##### 

##### Cada impuesto define.

##### 

##### Nombre

##### 

##### Porcentaje

##### 

##### Tipo

##### 

##### Vigencia

##### 

##### Estado

##### 

##### Código Fiscal

##### 

##### \---

##### 

##### \# Unidades de Medida

##### 

##### Ejemplos.

##### 

##### Unidad

##### 

##### Caja

##### 

##### Paquete

##### 

##### Metro

##### 

##### Litro

##### 

##### Kilogramo

##### 

##### Servicio

##### 

##### Hora

##### 

##### \---

##### 

##### \# Categorías

##### 

##### Jerarquía ilimitada.

##### 

##### Electrónica

##### 

##### ↓

##### 

##### Celulares

##### 

##### ↓

##### 

##### Accesorios

##### 

##### ↓

##### 

##### Cargadores

##### 

##### \---

##### 

##### \# Marcas

##### 

##### Ejemplos.

##### 

##### Samsung

##### 

##### Apple

##### 

##### Xiaomi

##### 

##### HP

##### 

##### Dell

##### 

##### \---

##### 

##### \# Modelos

##### 

##### Relacionados con marcas.

##### 

##### Samsung

##### 

##### ↓

##### 

##### Galaxy S24

##### 

##### Galaxy A56

##### 

##### Galaxy Tab

##### 

##### \---

##### 

##### \# Almacenes

##### 

##### Cada sucursal puede tener múltiples almacenes.

##### 

##### Tipos.

##### 

##### Principal

##### 

##### Tránsito

##### 

##### Reparación

##### 

##### Devoluciones

##### 

##### Consignación

##### 

##### \---

##### 

##### \# Métodos de Pago

##### 

##### Efectivo

##### 

##### Transferencia

##### 

##### Tarjeta

##### 

##### Cheque

##### 

##### Crédito

##### 

##### Pago Mixto

##### 

##### \---

##### 

##### \# Bancos

##### 

##### Listado configurable.

##### 

##### Nombre

##### 

##### Código

##### 

##### Cuenta Contable

##### 

##### Estado

##### 

##### \---

##### 

##### \# Series Documentales

##### 

##### Factura Fiscal

##### 

##### Factura Consumo

##### 

##### Nota Crédito

##### 

##### Nota Débito

##### 

##### Cotización

##### 

##### Orden Compra

##### 

##### Recepción

##### 

##### Conduce

##### 

##### \---

##### 

##### \# Estados Globales

##### 

##### Activo

##### 

##### Inactivo

##### 

##### Archivado

##### 

##### Suspendido

##### 

##### Bloqueado

##### 

##### \---

##### 

##### \# Auditoría

##### 

##### Todo Master Data registra.

##### 

##### Usuario

##### 

##### Fecha

##### 

##### Cambios

##### 

##### Motivo

##### 

##### \---

##### 

##### \# IA

##### 

##### La IA puede consultar Master Data.

##### 

##### Nunca modificarlo sin permisos.

##### 

##### Toda modificación requiere Workflow.

##### 

##### \---

##### 

##### \# Declaración Final

##### 

##### Todo módulo del ERP depende del Master Data.

##### 

##### Ninguna entidad podrá redefinir información ya existente en este documento.

##### 

##### El Master Data constituye la base común sobre la cual se construyen todos los procesos del sistema.

