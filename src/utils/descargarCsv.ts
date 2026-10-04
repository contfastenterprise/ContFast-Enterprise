/**
 * Descarga un CSV ya armado (lote 281). Es lo que hacia a mano el historico de caja (con la memoria
 * soltada tras descargar, lote 230), para que los dos exportes de la pantalla de Caja lo hagan igual.
 */
export function descargarCsv(nombre: string, contenido: string): void {
  const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.style.visibility = 'hidden';
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}
