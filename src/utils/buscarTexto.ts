/**
 * Buscar texto como lo escribe la gente: sin tildes y sin mayusculas.
 *
 * POR QUE (lote 189)
 * ------------------
 * El buscador del sidebar (Ctrl+K) filtraba con
 *
 *     item.name.toLowerCase().includes(query.toLowerCase())
 *
 * y eso deja fuera lo que nadie escribe con tilde. Nadie teclea "Facturación"
 * con el acento puesto cuando esta buscando rapido: teclea "facturacion", y no
 * encontraba nada. Lo mismo con la ñ.
 *
 * Y NO ES SOLO EL SIDEBAR: esta misma comparacion vale para cualquier filtro de
 * la aplicacion donde alguien escribe el nombre de algo -- un cliente, un
 * producto, un suplidor. De ahi que viva en `utils` y no dentro del sidebar.
 *
 * Es puro: sin base, sin red y sin React.
 */

/**
 * Sin tildes, sin diacriticos y en minusculas.
 *
 * `normalize('NFD')` separa la letra de su acento (`á` -> `a` + `´`) y el
 * reemplazo se lleva los acentos sueltos. Es la unica forma de hacerlo sin una
 * tabla de equivalencias a mano, que siempre se queda corta.
 *
 * La Ñ se conserva como N a proposito: quien busca "jimenez" tiene que encontrar
 * "JIMÉNEZ", y quien busca "nino" encontrara "niño". Lo contrario -- tratar la ñ
 * como letra aparte -- es correcto en un diccionario y molesto en un buscador.
 */
export function sinTildes(texto: string | null | undefined): string {
  if (!texto) return '';
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * ¿El texto contiene lo buscado, ignorando tildes y mayusculas?
 *
 * Una busqueda vacia coincide con TODO: es lo que deja la lista entera a la
 * vista mientras nadie ha escrito nada.
 */
export function coincide(texto: string | null | undefined, buscado: string | null | undefined): boolean {
  const aguja = sinTildes(buscado);
  if (aguja === '') return true;
  return sinTildes(texto).includes(aguja);
}

/**
 * Coincide con CUALQUIERA de los textos que se le pasen.
 *
 * En el sidebar se busca por el nombre del modulo y tambien por el de su grupo:
 * quien escribe "finanzas" espera ver lo que hay dentro de Finanzas, aunque
 * ninguno de esos elementos se llame asi.
 */
export function coincideEnAlguno(textos: (string | null | undefined)[], buscado: string | null | undefined): boolean {
  const aguja = sinTildes(buscado);
  if (aguja === '') return true;
  return textos.some((t) => sinTildes(t).includes(aguja));
}
