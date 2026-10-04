# Estándar de interfaz — ContFast Enterprise

Nació de la auditoría de UI del 2026-10-03 (`docs/auditoria/auditoria_ui_2026-10-03.md`, lotes 269
en adelante). **Regla de consistencia**: si dos elementos hacen lo mismo, se ven y se comportan igual,
salvo una razón de uso escrita aquí.

El estándar **no se inventó**: se tomó de lo que la mayoría de pantallas ya hacía a mano (45 copias
idénticas del botón principal, 34 del secundario, 19 del dorado de imprimir) y se convirtió en
componentes. Pasar una pantalla al estándar no debe cambiar lo que se ve en las pantallas que ya lo
seguían.

## 1. Colores (tokens de `globals.css`)

| Uso | Clase | Valor |
|---|---|---|
| Primario (acción principal, títulos) | `bg-primary`, `text-primary` | `#003366` |
| Hover del primario | `bg-primary-variant` | `#002244` |
| Texto sobre el primario | `text-primary-foreground`, `text-on-primary` | blanco |
| Documento (imprimir, exportar) | variante `documento` | `#C5A059` con texto `slate-950` |
| Dorado para TEXTO sobre fondo claro (títulos de sección, contadores) | `text-oro-texto` | `#8A6A2C` (5,0:1 sobre blanco) |
| Destructivo | `bg-destructive` | `#E11D48` (rose-600) |
| Bordes por defecto | `border` | `#E2E8F0` (slate-200) |
| Hover suave | `bg-accent` | `#F1F5F9` (slate-100) |

- **El dorado de la marca no se usa como color de TEXTO sobre fondo claro**: da 2,4:1 y el mínimo es 4,5:1. Para texto
  sobre blanco o gris claro va `text-oro-texto` (lote 275). El de la marca, en iconos, rellenos o texto sobre azul marino. Va como
  fondo (con texto oscuro) o en iconos decorativos.
- Los tokens del tema son tripletes HSL y **se usan siempre envueltos en `hsl()`** (lote 269). El
  banco `verificar_colores_del_tema.ts` resuelve el tema como el navegador y falla si alguno no es un
  color.

## 2. Botones — `@/components/ui/button`

`<Button variant size>`. Nunca un `<button>` con clases de botón escritas a mano.

| Variante | Para | Aspecto |
|---|---|---|
| `primary` (por defecto) | La acción principal: una por grupo | azul marino, texto blanco |
| `secondary` | Cancelar, volver, acciones que acompañan | blanco con borde |
| `outline` | Acción de la marca sin peso de principal (añadir línea) | borde azul, fondo transparente |
| `ghost` | Acciones de fila y de barra; casi siempre solo icono | sin fondo |
| `documento` | Imprimir, exportar, descargar | dorado, texto oscuro |
| `destructive` | Eliminar, anular, dar de baja | rose-600 |
| `success` / `warning` | Estados de éxito o aviso | esmeralda / ámbar con texto oscuro |

| Tamaño | Alto | Para |
|---|---|---|
| `md` (por defecto) | `h-9` (31,5 px) | cabeceras, formularios, ventanas |
| `sm` | `h-8` (28 px) | barras de herramientas, filtros, tablas |
| `lg` | `h-10` (35 px) | acción única de una pantalla vacía |
| `icon` / `icon-sm` | `size-9` / `size-8` | solo icono |

Los píxeles son con la fuente base del panel, **14 px** (`html { font-size: 14px }` en `globals.css`):
Tailwind mide en `rem`, así que todo sale al 87,5 % de lo que diría su documentación.

- Radio `rounded-lg` (`--radius`, 0,625 rem), texto `font-bold`, icono `size-4` (`size-3.5` en `sm`), separación `gap-2`.
- `isLoading` pone el giro y desactiva. Desactivado: `opacity-50`, sin puntero.
- **Foco visible**: anillo de 2 px del primario. No se quita.
- **`type` siempre explícito** dentro de un `<form>`: `submit` solo el que envía.

### Solo icono — `IconButton`

`<IconButton aria-label="Editar cliente">` — `aria-label` es **obligatorio por tipo** y se repite como
globo (`title`). Variante `ghost` y tamaño `icon-sm` por defecto.

## 3. Cabecera de página — `@/components/ui/cabecera-de-pagina`

```
[icono] Título                                  [secundarias] [principal]
descripción
```

`<CabeceraDePagina titulo descripcion icono acciones>`. Título `text-2xl md:text-3xl` azul marino,
icono dorado de 28 px, descripción `text-sm` gris. En el móvil las acciones bajan bajo el título.

- **Orden**: secundarias a la izquierda, la principal **la última** (a la derecha).
- **Con pestañas de registro** (lotes 240-243): las pestañas van **solas**; los demás botones viven
  en la barra de la lista. Lo vigila `verificar_pestanas_solas.ts`.

## 4. Formularios y ventanas — `@/components/ui/acciones-de-formulario`

```
                                      [Cancelar] [Guardar]
```

`<AccionesDeFormulario textoPrincipal alCancelar ...>`: a la derecha, **Cancelar primero y la
principal la última**. En el móvil se apilan con la principal **arriba** y a todo el ancho.
Para confirmar un borrado, `variantePrincipal="destructive"`.

Las confirmaciones (`useConfirm`) ya siguen este patrón desde el lote 216.

## 5. Tablas

- Las acciones de fila van en la **última columna, alineadas a la derecha**.
- Orden: **Ver · Editar · Imprimir · … · Eliminar** (lo destructivo, el último).
- Cada una es un `IconButton` `ghost` `icon-sm` con su `aria-label` ("Editar factura E31…").
- Con más de cuatro acciones, menú `…` (`MoreHorizontal`).
- Paginación: `components/ui/pagination.tsx` (lotes 128-133), siempre.

## 6. Iconos

Solo **lucide-react**. Equivalencias:

| Acción | Icono |
|---|---|
| Crear / añadir | `Plus` |
| Editar | `Pencil` (`Edit2` es el mismo dibujo) |
| Eliminar | `Trash2` |
| Cerrar | `X` |
| Guardar | `Save` |
| Buscar | `Search` |
| Ver | `Eye` |
| Filtrar | `Filter` |
| Imprimir | `Printer` |
| Exportar / descargar | `Download` (`FileSpreadsheet` para hojas de cálculo) |
| Recargar | `RefreshCw` |
| Volver | `ArrowLeft` |
| Configuración | `Settings` |

Tamaño: el que pone el botón (`size-4` y `size-3.5` en `sm`). Fuera de botones, `h-4 w-4` en texto y `h-5 w-5` en títulos de tarjeta.

## 7. Espaciado y contenedores

La escala de Tailwind (en `rem`: con la base de 14 px, cada paso son 3,5 px), con nombres para hablar de ella:

| Token | Clase | px |
|---|---|---|
| xs | `1` | 3,5 |
| sm | `2` | 7 |
| md | `4` | 14 |
| lg | `6` | 21 |
| xl | `8` | 28 |
| 2xl | `12` | 42 |

- Entre botones: `gap-2`. Entre campos: `gap-4`. Entre secciones de una página: `space-y-6`.
- Tarjetas: `rounded-xl border border-slate-200 bg-white shadow-sm`, relleno `p-4` (`p-6` en las grandes).
- **Ancho**: el panel ocupa todo el ancho a propósito (`main` con `p-4 md:p-8`, y
  `.dashboard-main-content > div { max-width: 100% }`). Un `max-w-*` en la raíz de una página no hace
  nada; solo vale dentro (formularios estrechos: `max-w-2xl`/`max-w-3xl`).

## 8. Accesibilidad (mínimos)

- Botón de solo icono: `aria-label`.
- Toda `<label>` con su `htmlFor`/`id` (lotes 227, 230, 239, 252).
- Área táctil mínima `h-8` (28 px con la base de 14 px).
- Contraste de texto ≥ 4,5:1 (≥ 3:1 en texto grande).
- Respuestas leídas con `leerRespuesta` (el estado antes que el cuerpo).

## 9. Excepciones (intencionadas)

- **Inicio** y las pantallas de **Inteligencia de Negocio**: tarjetas y gráficos propios; la cabecera sí sigue el estándar.
- **Tienda pública** (`src/app/[empresa]`): estética de Spree (lote 231), fuera del panel.
- **Plantillas de impresión** (`documentTemplates.ts`): papel, no pantalla.
