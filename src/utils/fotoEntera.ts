/**
 * Como se ajusta una foto a su recuadro (lote 237). Decision del dueño
 * (2026-10-01): "no importa que sea grande o pequeña, debe verse ajustada al
 * espacio" -- ENTERA, sin recortar.
 *
 * Antes las seis fotos (tarjeta del catalogo, ficha, portada, cotizacion y las
 * dos vistas previas del panel) llenaban el recuadro RECORTANDO lo que sobraba
 * (`object-cover`): en un recuadro cuadrado, una puerta -- alta y estrecha --
 * perdia la cabeza y el pie. Ahora se ve completa y centrada; si no tiene la
 * forma del recuadro quedan margenes del color de fondo.
 *
 * `mix-blend-multiply`: muchas fotos traen fondo blanco, y con margenes a la
 * vista quedaba un rectangulo blanco sobre el gris del recuadro (visto al
 * dibujar la portada; lo mismo que el logo en el lote 231). Sobre el gris
 * claro, a una foto normal no se le nota.
 *
 * Una sola constante para que las seis no vuelvan a separarse: la vista previa
 * del panel tiene que ensenar lo mismo que vera el visitante.
 */
export const FOTO_ENTERA = 'h-full w-full object-contain mix-blend-multiply';
