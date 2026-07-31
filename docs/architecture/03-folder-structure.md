# \# 03 - Folder Structure

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

# Este documento define la estructura oficial de directorios del ERP AI Platform.

# 

# La organización del código es obligatoria.

# 

# Ningún desarrollador o IA podrá crear carpetas arbitrariamente.

# 

# Toda nueva funcionalidad deberá respetar esta estructura.

# 

# \---

# 

# \# Objetivos

# 

# La estructura del proyecto debe facilitar:

# 

# \- Escalabilidad

# \- Mantenibilidad

# \- Modularidad

# \- Reutilización

# \- Descubrimiento rápido del código

# \- Bajo acoplamiento

# \- Alta cohesión

# 

# \---

# 

# \# Estructura General

# 

# src/

# 

# &#x20;   app/

# 

# &#x20;   ai/

# 

# &#x20;   modules/

# 

# &#x20;   shared/

# 

# &#x20;   infrastructure/

# 

# &#x20;   workflows/

# 

# &#x20;   integrations/

# 

# &#x20;   config/

# 

# &#x20;   lib/

# 

# &#x20;   types/

# 

# &#x20;   hooks/

# 

# &#x20;   styles/

# 

# \---

# 

# \# app/

# 

# Contiene únicamente la capa Presentation.

# 

# Incluye:

# 

# \- Pages

# \- Layouts

# \- Server Actions

# \- Route Handlers

# \- Middleware

# 

# No contiene reglas del negocio.

# 

# No contiene consultas SQL.

# 

# No contiene lógica empresarial.

# 

# Responsabilidad:

# 

# Mostrar información y recibir solicitudes del usuario.

# 

# \---

# 

# \# ai/

# 

# Contiene toda la plataforma de Inteligencia Artificial.

# 

# Nunca contendrá lógica del negocio.

# 

# Su única responsabilidad es interpretar, planificar y coordinar.

# 

# Estructura:

# 

# ai/

# 

# &#x20;   core/

# 

# &#x20;   orchestrator/

# 

# &#x20;   planner/

# 

# &#x20;   providers/

# 

# &#x20;   agents/

# 

# &#x20;   registry/

# 

# &#x20;   tools/

# 

# &#x20;   prompts/

# 

# &#x20;   memory/

# 

# &#x20;   context/

# 

# &#x20;   permissions/

# 

# &#x20;   events/

# 

# &#x20;   audit/

# 

# &#x20;   cache/

# 

# &#x20;   telemetry/

# 

# &#x20;   schemas/

# 

# \---

# 

# \# modules/

# 

# Contiene todos los dominios empresariales.

# 

# Cada módulo es completamente independiente.

# 

# Ejemplo.

# 

# modules/

# 

# &#x20;   customers/

# 

# &#x20;   sales/

# 

# &#x20;   inventory/

# 

# &#x20;   purchases/

# 

# &#x20;   suppliers/

# 

# &#x20;   reports/

# 

# &#x20;   dgii/

# 

# &#x20;   users/

# 

# &#x20;   settings/

# 

# &#x20;   repairs/

# 

# Cada módulo sigue exactamente la misma estructura.

# 

# \---

# 

# \# Estructura Oficial de un Módulo

# 

# Ejemplo:

# 

# modules/sales/

# 

# &#x20;   application/

# 

# &#x20;   domain/

# 

# &#x20;   infrastructure/

# 

# &#x20;   presentation/

# 

# &#x20;   workflows/

# 

# &#x20;   tools/

# 

# &#x20;   events/

# 

# &#x20;   permissions/

# 

# &#x20;   services/

# 

# &#x20;   repositories/

# 

# &#x20;   schemas/

# 

# &#x20;   validators/

# 

# &#x20;   components/

# 

# &#x20;   hooks/

# 

# &#x20;   types/

# 

# &#x20;   constants/

# 

# &#x20;   tests/

# 

# \---

# 

# \# application/

# 

# Contiene casos de uso.

# 

# Coordina operaciones.

# 

# Nunca implementa reglas del negocio.

# 

# Ejemplos.

# 

# CreateInvoiceUseCase

# 

# CancelInvoiceUseCase

# 

# \---

# 

# \# domain/

# 

# Contiene el conocimiento del negocio.

# 

# Incluye.

# 

# Entities

# 

# Value Objects

# 

# Policies

# 

# Specifications

# 

# Domain Services

# 

# Domain Events

# 

# Factories

# 

# Nunca depende de Next.js.

# 

# Nunca depende de React.

# 

# Nunca depende de PostgreSQL.

# 

# \---

# 

# \# infrastructure/

# 

# Implementaciones concretas.

# 

# Ejemplos.

# 

# Drizzle Repository

# 

# Supabase Storage

# 

# Email Provider

# 

# Groq Provider

# 

# OCR Provider

# 

# DGII Provider

# 

# \---

# 

# \# presentation/

# 

# Componentes exclusivos del módulo.

# 

# Forms.

# 

# Dialogs.

# 

# Pages.

# 

# Tables.

# 

# Cards.

# 

# No contiene reglas empresariales.

# 

# \---

# 

# \# workflows/

# 

# Procesos oficiales del módulo.

# 

# Ejemplo.

# 

# CreateInvoiceWorkflow

# 

# CancelInvoiceWorkflow

# 

# RegisterPaymentWorkflow

# 

# \---

# 

# \# tools/

# 

# Herramientas disponibles para la IA.

# 

# Ejemplo.

# 

# createInvoiceTool

# 

# cancelInvoiceTool

# 

# searchInvoiceTool

# 

# \---

# 

# \# events/

# 

# Eventos publicados por el módulo.

# 

# Ejemplo.

# 

# InvoiceCreated

# 

# InvoiceCanceled

# 

# InvoicePaid

# 

# \---

# 

# \# permissions/

# 

# Permisos del módulo.

# 

# Ejemplo.

# 

# invoice.create

# 

# invoice.edit

# 

# invoice.cancel

# 

# invoice.view

# 

# \---

# 

# \# repositories/

# 

# Interfaces e implementaciones de persistencia.

# 

# Nunca acceder directamente desde React.

# 

# \---

# 

# \# validators/

# 

# Validaciones del módulo.

# 

# Utilizando Zod.

# 

# Nunca duplicar validaciones.

# 

# \---

# 

# \# schemas/

# 

# Schemas reutilizables.

# 

# \---

# 

# \# types/

# 

# Tipos exclusivos del módulo.

# 

# \---

# 

# \# constants/

# 

# Constantes del módulo.

# 

# Nunca valores mágicos.

# 

# \---

# 

# \# tests/

# 

# Pruebas unitarias.

# 

# Pruebas integración.

# 

# \---

# 

# \# shared/

# 

# Contiene únicamente elementos compartidos.

# 

# shared/

# 

# &#x20;   types/

# 

# &#x20;   errors/

# 

# &#x20;   events/

# 

# &#x20;   utils/

# 

# &#x20;   helpers/

# 

# &#x20;   constants/

# 

# &#x20;   validation/

# 

# &#x20;   permissions/

# 

# &#x20;   audit/

# 

# &#x20;   localization/

# 

# &#x20;   dates/

# 

# &#x20;   money/

# 

# &#x20;   logger/

# 

# Nunca colocar lógica específica de un módulo.

# 

# \---

# 

# \# workflows/

# 

# Motor general de Workflows.

# 

# No contiene procesos específicos.

# 

# Contiene:

# 

# Workflow Engine

# 

# Pipeline

# 

# Execution

# 

# Context

# 

# Registry

# 

# \---

# 

# \# integrations/

# 

# Todos los servicios externos.

# 

# Ejemplo.

# 

# DGII

# 

# Groq

# 

# Gemini

# 

# OpenAI

# 

# OCR

# 

# Email

# 

# SMS

# 

# WhatsApp

# 

# Storage

# 

# Nunca acceder directamente desde módulos.

# 

# Siempre mediante interfaces.

# 

# \---

# 

# \# infrastructure/

# 

# Servicios técnicos compartidos.

# 

# Ejemplo.

# 

# Database

# 

# Cache

# 

# Queue

# 

# Scheduler

# 

# Logger

# 

# Configuration

# 

# \---

# 

# \# config/

# 

# Configuración global.

# 

# Variables.

# 

# Features.

# 

# Flags.

# 

# Environment.

# 

# \---

# 

# \# lib/

# 

# Bibliotecas internas.

# 

# Nunca lógica empresarial.

# 

# \---

# 

# \# hooks/

# 

# Hooks reutilizables.

# 

# No hooks específicos de módulos.

# 

# \---

# 

# \# styles/

# 

# Configuración global de estilos.

# 

# Tailwind.

# 

# Temas.

# 

# Tokens.

# 

# \---

# 

# \# Archivos Prohibidos

# 

# Nunca crear.

# 

# helpers.ts

# 

# utils.ts

# 

# services.ts

# 

# functions.ts

# 

# common.ts

# 

# misc.ts

# 

# final.ts

# 

# new.ts

# 

# temp.ts

# 

# Porque no representan responsabilidades claras.

# 

# \---

# 

# \# Organización de Archivos

# 

# Cada archivo debe contener una única responsabilidad.

# 

# Incorrecto.

# 

# invoice.ts

# 

# Correcto.

# 

# create-invoice.workflow.ts

# 

# cancel-invoice.workflow.ts

# 

# invoice.entity.ts

# 

# invoice.repository.ts

# 

# invoice.schema.ts

# 

# \---

# 

# \# Tamaño de Archivos

# 

# Reglas recomendadas.

# 

# Componentes React

# 

# Máximo 300 líneas.

# 

# Servicios

# 

# Máximo 250 líneas.

# 

# Workflows

# 

# Máximo 200 líneas.

# 

# Tools

# 

# Máximo 150 líneas.

# 

# Funciones

# 

# Máximo 60 líneas.

# 

# Cuando un archivo supera estos límites debe evaluarse dividirlo.

# 

# \---

# 

# \# Convención de Nombres

# 

# Carpetas

# 

# kebab-case

# 

# Archivos

# 

# kebab-case

# 

# Interfaces

# 

# PascalCase con prefijo I

# 

# Ejemplo.

# 

# IInvoiceRepository

# 

# Clases

# 

# PascalCase

# 

# Funciones

# 

# camelCase

# 

# Constantes

# 

# UPPER\_SNAKE\_CASE

# 

# Enums

# 

# PascalCase

# 

# Tipos

# 

# PascalCase

# 

# \---

# 

# \# Importaciones

# 

# Orden obligatorio.

# 

# 1\.

# 

# Node

# 

# 2\.

# 

# Third Party

# 

# 3\.

# 

# Shared

# 

# 4\.

# 

# Infrastructure

# 

# 5\.

# 

# Modules

# 

# 6\.

# 

# Relative

# 

# Nunca mezclar el orden.

# 

# \---

# 

# \# Dependencias Permitidas

# 

# Presentation

# 

# ↓

# 

# Application

# 

# ↓

# 

# Domain

# 

# ↓

# 

# Interfaces

# 

# ↓

# 

# Infrastructure

# 

# Nunca al revés.

# 

# \---

# 

# \# Dependencias Prohibidas

# 

# React → Database

# 

# Domain → React

# 

# Domain → Next.js

# 

# AI → Database

# 

# UI → SQL

# 

# Workflow → React

# 

# \---

# 

# \# Reglas para IA

# 

# Toda IA que genere código deberá.

# 

# Buscar primero componentes existentes.

# 

# Buscar interfaces.

# 

# Buscar tipos.

# 

# Buscar validaciones.

# 

# Buscar Workflows.

# 

# Buscar Tools.

# 

# Reutilizar antes de crear.

# 

# Nunca duplicar.

# 

# \---

# 

# \# Checklist

# 

# Antes de crear un archivo.

# 

# ¿Existe ya?

# 

# ¿Puede reutilizarse?

# 

# ¿Pertenece a este módulo?

# 

# ¿Respeta la arquitectura?

# 

# ¿Respeta las dependencias?

# 

# ¿Tiene una única responsabilidad?

# 

# Solo entonces podrá crearse.

# 

# \---

# 

# \# Declaración Final

# 

# La estructura de carpetas representa la arquitectura física del ERP.

# 

# Modificar esta organización sin una ADR aprobada está prohibido.

# 

# Toda nueva funcionalidad deberá integrarse respetando exactamente esta estructura.

