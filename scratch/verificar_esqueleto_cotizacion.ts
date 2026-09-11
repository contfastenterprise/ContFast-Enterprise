/**
 * El esqueleto mientras se lee la cotizacion.
 *
 * QUE PASABA
 * ----------
 * Al entrar a facturar desde una cotizacion (`?quoteId=...`), el formulario se
 * abria VACIO -- con su linea de producto en blanco -- y se rellenaba de golpe
 * cuando respondia `/convert`. Durante ese hueco no habia forma de distinguirlo
 * de una factura nueva, y si empezabas a escribir, lo escrito se perdia al
 * llegar los datos.
 *
 * Y si la conversion FALLABA, ese formulario vacio se quedaba: el `.then` no
 * tenia `else` ni `.catch`. Te ponias a escribir la factura a mano sin saber
 * que la cotizacion no se habia leido.
 *
 * QUE HACE AHORA
 * --------------
 * Un esqueleto con la FORMA del formulario que va a llegar -- la rejilla de
 * ajustes, el cliente, tres lineas, los totales. Ese es el unico motivo por el
 * que un esqueleto gana a un girador: si no anticipa lo que viene, es peor,
 * porque ademas miente sobre la disposicion.
 *
 * Tres detalles que son el fondo del asunto y por eso se comprueban:
 *
 *   - EMPIEZA PUESTO. El estado nace en `true` si la URL trae `quoteId`, y no
 *     en el efecto: puesto en el efecto, el primer pintado ya habria ensenado
 *     el formulario vacio, que es justo lo que esto viene a evitar.
 *
 *   - ESPERA AL CLIENTE. Los datos del comprador son una SEGUNDA consulta. Sin
 *     encadenarla, el esqueleto se quitaba al llegar las lineas y el RNC
 *     aparecia un instante despues, encima de un formulario que ya parecia
 *     listo. "Hasta que carguen los datos" son los datos, no los primeros.
 *
 *   - REINTENTAR REINTENTA. La carga vive FUERA del efecto. Dentro no habria
 *     forma: el efecto depende de `searchParams`, que no cambia al pulsar un
 *     boton, asi que el boton no habria hecho nada -- justo cuando lo pulsas
 *     porque algo fallo.
 *
 * Contra el HEAD anterior: las 8 fallan.
 */
import { fuente as fuenteCruda, crudo as crudoCrudo } from './_fuente';

const PANT = 'src/app/dashboard/invoices/page.tsx';
const src = fuenteCruda(PANT).replace(/\r\n/g, '\n');
const conComentarios = crudoCrudo(PANT).replace(/\r\n/g, '\n');

let fallos = 0;
function ok(t: string, c: boolean): void {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!c) fallos++;
}

const veces = (s: string, sub: string): number => s.split(sub).length - 1;

ok('hay esqueleto, y tiene la FORMA del formulario que va a llegar',
  src.includes('function EsqueletoCotizacion() {')
  && src.includes('data-esqueleto-cotizacion')
  && src.includes('animate-pulse')
  // tres lineas y tres totales, cuatro campos de ajustes: la forma, no un
  // cuadro gris generico
  && veces(src, '{[0, 1, 2].map((i) => (') >= 2
  && src.includes('{[0, 1, 2, 3].map((i) => ('));

ok('el esqueleto SUSTITUYE al formulario, no se pinta detras',
  src.includes('{cargandoCotizacion ? (\n              <EsqueletoCotizacion />')
  && src.includes('            </form>\n            )}\n          </motion.div>'));

ok('empieza puesto: el primer pintado no ensena el formulario vacio',
  src.includes("useState<boolean>(\n    () => !!searchParams.get('quoteId')\n  );"));

ok('no se quita hasta que tambien haya llegado el cliente',
  src.includes('let esperaCliente: Promise<unknown> = Promise.resolve();')
  && src.includes('esperaCliente = fetch(`/api/v1/customers/${quote.customerId}`)')
  && src.includes('return esperaCliente;')
  && src.includes('.finally(() => {\n          setCargandoCotizacion(false);\n        });'));

ok('un fallo de la conversion ya no deja un formulario en blanco',
  src.includes('setErrorCotizacion(motivoDeCarga(null, data?.error?.message));')
  && src.includes('.catch((err) => {\n          setErrorCotizacion(motivoDeCarga(err));\n        })')
  && src.includes('<ErrorDeCarga\n                mensaje={errorCotizacion}'));

ok('y reintentar REINTENTA (la carga vive fuera del efecto)',
  src.includes('const cargarCotizacion = useCallback((qid: string) => {')
  && src.includes('onReintentar={() => cargarCotizacion(quoteId)}')
  && !src.includes('router.refresh()')
  && src.includes('cargarCotizacion(qid);'));

ok('el fallo al traer el cliente deja de ser un console.error a secas',
  conComentarios.includes('no se pudieron traer los datos del cliente')
  && src.includes('toast.warning('));

ok('para un lector de pantalla esto es ausencia de contenido, no contenido',
  src.includes('aria-busy="true"') && src.includes('aria-hidden="true"'));

console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLA(S)`);
process.exit(fallos === 0 ? 0 : 1);
