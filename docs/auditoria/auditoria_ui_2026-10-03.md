# Auditoría de UI/UX — 2026-10-03

Pedida por el dueño: *"que todas las páginas compartan un mismo lenguaje visual y un mismo sistema de
posicionamiento de acciones, sin alterar la lógica de negocio"*. El estándar que sale de aquí está
en `docs/estandar_ui.md`. Las mediciones se hicieron con `scratch/_to_delete/auditoria_ui.mjs`
(clasifica cada `<button>` de `src` por función, color, alto, radio, letra y orden) y en el
navegador, con las pantallas reales montadas y la red sustituida.

## Alcance medido

- **71 páginas** (`page.tsx`) y **209 componentes** `.tsx`; **135 ficheros** con botones.
- **712 botones**: **30** con el componente `Button` y **682 escritos a mano**.
- **64 ventanas escritas a mano** (`fixed inset-0`) en 36 ficheros; el `Dialog` compartido lo usan 4.
- **Una sola biblioteca de iconos** (lucide-react, 156 importaciones).
- **12 formas distintas** de escribir el título de una página.

## Hallazgos, por prioridad

### CRÍTICO

| # | Dónde | Problema | Estado |
|---|---|---|---|
| C1 | `globals.css` (toda la aplicación) | Los colores del tema **no existían**: `@theme inline` usaba tripletes HSL sin `hsl()`. `<Button>`, el destructivo, la barra de acciones de e-CF, "Agregar" de Departamentos: transparentes o con texto blanco invisible. Todo `border` sin color, negro | **Cerrado, lote 269** |
| C2 | 26 clases | `text-on-primary` y `bg-primary-variant` nombraban colores inexistentes | **Cerrado, lote 269** |
| C3 | 99 botones de solo icono | Sin `aria-label` ni `title`: un lector de pantalla dice "botón" y nada más | Trinquete en el 270; se cierran al pasar cada pantalla |
| C4 | Títulos dorados (Compras, Facturación, Cotizaciones, alta de cotización, configuración inicial) | `text-[#c5a059]` sobre blanco: **2,4:1** (mínimo 4,5:1) | Con la cabecera estándar (`CabeceraDePagina`) |

### ALTO

| # | Elemento | Problema | Estándar |
|---|---|---|---|
| A1 | Botones principales | 86 escritos a mano con el azul marino; además azul `bg-primary`, dorado y verde para la misma acción ("Guardar"/"Registrar"); alto de `h-8` a `py-3.5`, radio de `rounded-md` a `rounded-2xl`, letra `text-xs`/`text-sm` | `Button` `primary` `md` |
| A2 | Cancelar | 68: blanco con borde la mayoría, pero también rosa, gris y azul oscuro | `Button` `secondary` |
| A3 | Orden en los pies | 35 `[Cancelar] [Guardar]` y **3 al revés**: `purchases/orders/page.tsx:1216`, `purchases/page.tsx:1693`, `components/precios/TasaDelDolarEnLinea.tsx:63` | `AccionesDeFormulario` |
| A4 | Imprimir / exportar | Dorado (18), azul marino (5), contorno (4), verde turquesa (4), esmeralda (2)… | `Button` `documento` |
| A5 | `type` | **405** botones sin `type` explícito; dentro de un `<form>` cualquiera de ellos lo envía | `type` siempre explícito |
| A6 | Cabeceras | 12 estilos de título (azul marino, dorado, gris, `text-primary`), de `text-xl` a `text-4xl`; acciones a la derecha o debajo | `CabeceraDePagina` |
| A7 | Ventanas | 64 hechas a mano, cada una con su cabecera, su cierre y su pie | `Dialog` compartido + `AccionesDeFormulario` |
| A8 | `Button` | Animaba la escala al pasar el ratón; los botones a mano no | Sin escala |

### MEDIO

| # | Elemento | Problema | Estándar |
|---|---|---|---|
| M1 | Iconos de editar | `Edit2` (10), `Pencil` (4), `Edit` (2) | `Pencil` |
| M2 | Iconos de filtrar | `Filter` (12), `ListFilter` (4), `SlidersHorizontal` (1) | `Filter` |
| M3 | Iconos de recargar | `RefreshCw` (60), `RotateCcw` (3), `RotateCw` (1) | `RefreshCw` |
| M4 | Botones de icono | `p-1`, `p-1.5`, `p-2`, `h-8`, con `rounded`, `rounded-lg`, `rounded-xl`, `rounded-full` | `IconButton` `icon-sm` |
| M5 | `text-body-sm` (3 usos) | Nombra un tamaño de letra que no existe: no hace nada | `text-sm` |

### BAJO

| # | Elemento | Observación |
|---|---|---|
| B1 | `max-w-*` en la raíz de las páginas (33 `max-w-7xl`) | No hacen nada: `.dashboard-main-content > div` fuerza el ancho completo. Es la decisión de diseño (documentada); se pueden quitar al tocar cada página |
| B2 | `bg-surface-dark*` | Solo tras `dark:`, y el modo oscuro no se activa nunca |

## Lo que ya estaba bien (no se toca)

- **Paginación**: un solo componente desde los lotes 128-133.
- **Confirmaciones**: `useConfirm` con fondo y pie comunes desde el lote 216.
- **Pestañas de registro**: un componente y una regla (pestañas solas en la cabecera), lotes 240-250.
- **Contenedor**: todas las páginas ocupan el ancho con el mismo relleno (`p-4 md:p-8`).
- **Iconos**: una sola biblioteca.

## Plan de lotes

| Lote | Asunto |
|---|---|
| 269 | Colores del tema (C1, C2) — **hecho** |
| 270 | Estándar: `Button` alineado con la casa, `IconButton`, `CabeceraDePagina`, `AccionesDeFormulario`; `docs/estandar_ui.md`; trinquete de lo escrito a mano — **hecho** |
| 271 y siguientes | Pasar las pantallas, por grupos del menú: cabecera estándar (C4, A6), botones al componente (A1, A2, A4), pies (A3), `type` (A5), solo icono con `aria-label` (C3, M4), iconos (M1-M3). Cada lote baja los techos del trinquete |

## Matriz por fichero (los que tienen 4 botones a mano o más)

"Solo icono sin aria-label" es *sin nombre / total de solo icono*.

| Fichero | Botones a mano | Solo icono sin aria-label | Sin `type` | Título dorado |
|---|---|---|---|---|
| `purchases/page.tsx` | 45 | 22/23 | 30 | sí |
| `invoices/page.tsx` | 35 | 16/17 | 19 | sí |
| `products/page.tsx` | 32 | 15/16 | 14 |  |
| `ecf/page.tsx` | 24 | 10/10 | 19 |  |
| `purchases/orders/page.tsx` | 24 | 0/9 | 7 |  |
| `admin/page.tsx` | 23 | 6/6 | 15 |  |
| `accounting/page.tsx` | 22 | 5/5 | 14 |  |
| `receivables/page.tsx` | 21 | 8/9 | 11 |  |
| `page.tsx` | 15 | 7/7 | 14 |  |
| `quotes/[id]/edit/page.tsx` | 15 | 7/7 | 10 |  |
| `products/barcodes/page.tsx` | 14 | 6/6 | 13 |  |
| `adjustments/page.tsx` | 13 | 4/4 | 5 |  |
| `hr/departments/page.tsx` | 13 | 7/7 | 9 |  |
| `hr/payroll/page.tsx` | 11 | 3/3 | 9 |  |
| `ap/page.tsx` | 10 | 2/2 | 8 |  |
| `admin/companies/page.tsx` | 9 | 4/5 | 4 |  |
| `customers/page.tsx` | 9 | 6/6 | 7 |  |
| `quotes/page.tsx` | 9 | 6/6 | 9 | sí |
| `src/components/bi/vista-inteligencia-negocio.tsx` | 9 | 0/0 | 9 |  |
| `src/components/ui/new-app-sidebar.tsx` | 9 | 5/6 | 8 |  |
| `bank/page.tsx` | 8 | 0/1 | 2 |  |
| `hr/settlements/page.tsx` | 8 | 3/3 | 7 |  |
| `quotes/new/page.tsx` | 8 | 3/3 | 2 | sí |
| `tools/desglose/puertas/page.tsx` | 8 | 0/0 | 6 |  |
| `cash/components/VistaHistorico.tsx` | 7 | 2/3 | 7 |  |
| `hr/employees/page.tsx` | 7 | 4/5 | 4 |  |
| `retentions/page.tsx` | 7 | 3/3 | 5 |  |
| `cash/components/VistaApertura.tsx` | 6 | 0/1 | 0 |  |
| `hr/overtime/page.tsx` | 6 | 1/3 | 2 |  |
| `hr/vacations/page.tsx` | 6 | 1/2 | 4 |  |
| `warehouses/page.tsx` | 6 | 2/2 | 4 |  |
| `src/app/setup/page.tsx` | 6 | 4/4 | 3 | sí |
| `cash/components/VistaGestion.tsx` | 5 | 2/2 | 5 |  |
| `delivery-notes/components/TablaDeConduces.tsx` | 5 | 4/5 | 4 |  |
| `inventory/categories/page.tsx` | 5 | 2/2 | 3 |  |
| `inventory/transfer/page.tsx` | 5 | 1/1 | 3 |  |
| `products/components/AtarProductoAlDolar.tsx` | 5 | 0/1 | 0 |  |
| `settings/components/TiposDeGastos.tsx` | 5 | 2/2 | 4 |  |
| `suppliers/page.tsx` | 5 | 2/2 | 3 |  |
| `tools/desglose/ventanas/page.tsx` | 5 | 1/1 | 4 |  |
| `src/app/[empresa]/mi-cotizacion/CartPageClient.tsx` | 5 | 0/3 | 0 |  |
| `src/components/cartera/TablaCartera.tsx` | 5 | 0/0 | 5 |  |
| `cash/components/ModalMovimiento.tsx` | 4 | 0/1 | 0 |  |
| `delivery-notes/components/FormularioDeConduce.tsx` | 4 | 0/0 | 1 |  |
| `financial/customers/page.tsx` | 4 | 0/0 | 4 |  |
| `financial/suppliers/page.tsx` | 4 | 0/0 | 4 |  |
| `inventory/adjustments/page.tsx` | 4 | 2/2 | 4 |  |
| `products/components/TablaDePreciosEnDolares.tsx` | 4 | 0/4 | 0 |  |
| `tools/glass-cutting/page.tsx` | 4 | 1/1 | 4 |  |
| `tools/qr-store/components/QRPreview.tsx` | 4 | 0/0 | 4 |  |
| `src/components/bi/bi-inventory.tsx` | 4 | 0/0 | 4 |  |
| `src/components/bi/bi-products.tsx` | 4 | 0/0 | 4 |  |
| `src/components/storefront/CabeceraTienda.tsx` | 4 | 0/2 | 0 |  |
