# \# 07 - AI Core Architecture

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

# El AI Core representa el cerebro de la plataforma ERP AI.

# 

# No contiene reglas del negocio.

# 

# No conoce la base de datos.

# 

# No conoce PostgreSQL.

# 

# No conoce Drizzle.

# 

# No conoce React.

# 

# No conoce Next.js.

# 

# Su única responsabilidad es comprender solicitudes, planificar acciones, coordinar agentes y comunicarse con el ERP mediante contratos bien definidos.

# 

# \---

# 

# \# Objetivos

# 

# El AI Core debe ser capaz de:

# 

# \- Comprender lenguaje natural.

# \- Mantener contexto.

# \- Planificar tareas.

# \- Seleccionar herramientas.

# \- Coordinar agentes.

# \- Ejecutar Workflows del ERP.

# \- Aprender preferencias del negocio.

# \- Generar respuestas claras.

# \- Registrar auditoría.

# \- Ser independiente del proveedor IA.

# 

# \---

# 

# \# Principios

# 

# El AI Core sigue los siguientes principios:

# 

# \- AI First

# \- Provider Agnostic

# \- Tool Driven

# \- Agent Based

# \- Context Aware

# \- Workflow First

# \- Permission Aware

# \- Event Driven

# \- Memory Enabled

# \- Fully Auditable

# 

# \---

# 

# \# Arquitectura General

# 

# ```text

# &#x20;                   Usuario

# 

# &#x20;                       │

# 

# &#x20;                       ▼

# 

# &#x20;                AI Gateway

# 

# &#x20;                       │

# 

# &#x20;                       ▼

# 

# &#x20;                Context Manager

# 

# &#x20;                       │

# 

# &#x20;                       ▼

# 

# &#x20;               Intent Analyzer

# 

# &#x20;                       │

# 

# &#x20;                       ▼

# 

# &#x20;                   Planner

# 

# &#x20;                       │

# 

# &#x20;                       ▼

# 

# &#x20;             Permission Manager

# 

# &#x20;                       │

# 

# &#x20;                       ▼

# 

# &#x20;               Agent Orchestrator

# 

# &#x20;                       │

# 

# &#x20;                       ▼

# 

# &#x20;               Tool Registry

# 

# &#x20;                       │

# 

# &#x20;                       ▼

# 

# &#x20;               Tool Executor

# 

# &#x20;                       │

# 

# &#x20;                       ▼

# 

# &#x20;                Workflow Engine

# 

# &#x20;                       │

# 

# &#x20;                       ▼

# 

# &#x20;                Response Builder

# 

# &#x20;                       │

# 

# &#x20;                       ▼

# 

# &#x20;                   Usuario

# ```

# 

# \---

# 

# \# Componentes

# 

# \## AI Gateway

# 

# Es la puerta de entrada.

# 

# Responsabilidades:

# 

# \- Recibir solicitudes.

# \- Crear contexto inicial.

# \- Generar Request ID.

# \- Validar autenticación.

# \- Iniciar auditoría.

# 

# Nunca ejecuta lógica.

# 

# \---

# 

# \## Context Manager

# 

# Construye el contexto completo.

# 

# Incluye:

# 

# Empresa.

# 

# Sucursal.

# 

# Usuario.

# 

# Roles.

# 

# Permisos.

# 

# Idioma.

# 

# Módulo actual.

# 

# Página actual.

# 

# Entidad seleccionada.

# 

# Formulario activo.

# 

# Fecha.

# 

# Zona horaria.

# 

# Preferencias.

# 

# \---

# 

# \## Memory Manager

# 

# Gestiona la memoria.

# 

# Tipos:

# 

# Session Memory

# 

# User Memory

# 

# Business Memory

# 

# Knowledge Memory

# 

# Conversation Memory

# 

# Nunca almacena datos sensibles.

# 

# \---

# 

# \## Intent Analyzer

# 

# Determina qué desea hacer el usuario.

# 

# Ejemplo.

# 

# "Crea una factura."

# 

# ↓

# 

# create\_invoice

# 

# "No encuentra el cliente."

# 

# ↓

# 

# search\_customer

# 

# La salida siempre es estructurada.

# 

# \---

# 

# \## Planner

# 

# Convierte una intención en un plan.

# 

# Ejemplo.

# 

# Buscar Cliente

# 

# ↓

# 

# Validar Productos

# 

# ↓

# 

# Calcular Impuestos

# 

# ↓

# 

# Crear Factura

# 

# ↓

# 

# Enviar Correo

# 

# El Planner nunca ejecuta.

# 

# \---

# 

# \## Permission Manager

# 

# Verifica permisos.

# 

# Toda acción pasa por este componente.

# 

# Nunca existen permisos especiales para la IA.

# 

# \---

# 

# \## Agent Orchestrator

# 

# Coordina todos los agentes.

# 

# Decide.

# 

# Qué agente utilizar.

# 

# En qué orden.

# 

# Cómo combinar resultados.

# 

# Cómo resolver conflictos.

# 

# \---

# 

# \## Tool Registry

# 

# Catálogo oficial de herramientas.

# 

# Permite descubrir capacidades.

# 

# Nunca contiene lógica.

# 

# \---

# 

# \## Tool Executor

# 

# Ejecuta herramientas.

# 

# No interpreta.

# 

# No decide.

# 

# Solo ejecuta.

# 

# \---

# 

# \## Response Builder

# 

# Construye la respuesta final.

# 

# Puede utilizar:

# 

# Markdown.

# 

# Tablas.

# 

# Listas.

# 

# Resúmenes.

# 

# Explicaciones.

# 

# Nunca inventa información.

# 

# \---

# 

# \# Flujo Completo

# 

# ```text

# Usuario

# 

# ↓

# 

# Gateway

# 

# ↓

# 

# Context

# 

# ↓

# 

# Intent

# 

# ↓

# 

# Planner

# 

# ↓

# 

# Permisos

# 

# ↓

# 

# Agentes

# 

# ↓

# 

# Tools

# 

# ↓

# 

# Workflow

# 

# ↓

# 

# Eventos

# 

# ↓

# 

# Respuesta

# ```

# 

# \---

# 

# \# Agentes

# 

# Cada agente posee una única responsabilidad.

# 

# Ejemplos.

# 

# Sales Agent

# 

# Inventory Agent

# 

# Purchase Agent

# 

# Customer Agent

# 

# Supplier Agent

# 

# DGII Agent

# 

# Repair Agent

# 

# Report Agent

# 

# Dashboard Agent

# 

# Notification Agent

# 

# Security Agent

# 

# Cada agente conoce únicamente su dominio.

# 

# \---

# 

# \# Herramientas (Tools)

# 

# Toda acción del ERP debe exponerse mediante una Tool.

# 

# Ejemplos.

# 

# createInvoice()

# 

# searchCustomer()

# 

# adjustInventory()

# 

# createPurchase()

# 

# generateBarcode()

# 

# registerRepair()

# 

# Las Tools llaman a Workflows.

# 

# Nunca al repositorio.

# 

# \---

# 

# \# Capacidades (Capabilities)

# 

# Los agentes no conocen módulos.

# 

# Descubren capacidades.

# 

# Ejemplo.

# 

# Capability

# 

# create\_invoice

# 

# ↓

# 

# Tool

# 

# createInvoiceTool

# 

# ↓

# 

# Workflow

# 

# CreateInvoiceWorkflow

# 

# \---

# 

# \# Tipos de Memoria

# 

# \## Session Memory

# 

# Solo vive durante la conversación.

# 

# \---

# 

# \## User Memory

# 

# Preferencias del usuario.

# 

# Idioma.

# 

# Formato.

# 

# Estilo.

# 

# \---

# 

# \## Business Memory

# 

# Información permanente de la empresa.

# 

# Moneda.

# 

# Impuestos.

# 

# Configuraciones.

# 

# Políticas.

# 

# \---

# 

# \## Knowledge Memory

# 

# Documentación.

# 

# Manual.

# 

# Normativas.

# 

# DGII.

# 

# Políticas internas.

# 

# \---

# 

# \## Conversation Memory

# 

# Resumen de conversaciones anteriores.

# 

# \---

# 

# \# Prompt Builder

# 

# Construye el prompt final.

# 

# Incluye.

# 

# Contexto.

# 

# Historial.

# 

# Permisos.

# 

# Capacidades.

# 

# Documentación.

# 

# Restricciones.

# 

# Nunca envía información innecesaria.

# 

# \---

# 

# \# AI Providers

# 

# El AI Core soporta múltiples proveedores.

# 

# Groq

# 

# Gemini

# 

# OpenAI

# 

# Claude

# 

# Modelos Locales

# 

# Todos implementan la misma interfaz.

# 

# ```typescript

# interface IAIProvider {

# 

# &#x20;   chat()

# 

# &#x20;   embeddings()

# 

# &#x20;   summarize()

# 

# &#x20;   classify()

# 

# }

# ```

# 

# \---

# 

# \# Auditoría

# 

# Toda interacción registra.

# 

# Usuario.

# 

# Modelo.

# 

# Proveedor.

# 

# Tokens.

# 

# Costo.

# 

# Tiempo.

# 

# Herramientas.

# 

# Workflow.

# 

# Resultado.

# 

# \---

# 

# \# Seguridad

# 

# La IA nunca:

# 

# Ejecuta SQL.

# 

# Accede a PostgreSQL.

# 

# Ignora permisos.

# 

# Modifica entidades.

# 

# Ejecuta Workflows directamente.

# 

# Toda operación pasa por Tools.

# 

# \---

# 

# \# Manejo de Errores

# 

# Si una Tool falla.

# 

# ↓

# 

# Registrar Error

# 

# ↓

# 

# Intentar Recuperación

# 

# ↓

# 

# Responder Claramente

# 

# ↓

# 

# Registrar Auditoría

# 

# Nunca ocultar errores.

# 

# \---

# 

# \# Integración con Eventos

# 

# La IA escucha eventos.

# 

# Ejemplos.

# 

# InvoiceCreated

# 

# ↓

# 

# Actualizar contexto.

# 

# ↓

# 

# Generar recomendaciones.

# 

# ↓

# 

# Detectar patrones.

# 

# Nunca modifica el evento.

# 

# \---

# 

# \# Integración con Workflows

# 

# Los Workflows representan la lógica del negocio.

# 

# La IA únicamente solicita su ejecución.

# 

# Nunca implementa lógica empresarial.

# 

# \---

# 

# \# Contexto Mínimo

# 

# Toda solicitud debe contener:

# 

# Empresa.

# 

# Usuario.

# 

# Roles.

# 

# Permisos.

# 

# Idioma.

# 

# Módulo.

# 

# Fecha.

# 

# Zona horaria.

# 

# Conversation ID.

# 

# Correlation ID.

# 

# \---

# 

# \# Reglas Obligatorias

# 

# La IA nunca inventa datos.

# 

# La IA nunca modifica directamente la Base de Datos.

# 

# La IA nunca ignora permisos.

# 

# La IA nunca ejecuta SQL.

# 

# Toda acción utiliza una Tool.

# 

# Toda Tool ejecuta un Workflow.

# 

# Todo Workflow genera eventos.

# 

# Toda interacción queda auditada.

# 

# \---

# 

# \# Objetivo Final

# 

# El AI Core debe comportarse como un Director de Operaciones Empresariales.

# 

# Debe comprender el negocio.

# 

# Debe coordinar procesos.

# 

# Debe explicar decisiones.

# 

# Debe automatizar tareas.

# 

# Debe ayudar al usuario.

# 

# Nunca debe reemplazar las reglas oficiales del ERP.

# 

# \---

# 

# \# Declaración Final

# 

# El AI Core constituye la plataforma inteligente del ERP AI Platform.

# 

# Su diseño garantiza independencia tecnológica, escalabilidad y seguridad.

# 

# Gracias a esta arquitectura, el sistema puede incorporar nuevos agentes, nuevos proveedores de IA y nuevas capacidades sin modificar el núcleo del ERP.

