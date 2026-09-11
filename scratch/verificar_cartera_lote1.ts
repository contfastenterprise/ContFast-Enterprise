/**
 * Cartera (panel de estado financiero), lote 1: de donde salen los numeros.
 *
 * La pantalla viene de un proyecto de AI Studio que funcionaba con datos de
 * ejemplo. Portar la apariencia es lo facil; lo que decide si esto sirve es
 * que los numeros sean los de la empresa, del entorno correcto, y que el
 * riesgo no sea un dato que envejece solo.
 *
 * QUE DEFIENDE ESTE BANCO
 * -----------------------
 *   1. EL RIESGO SE DERIVA. `nivelPorAtraso` es una funcion pura y se prueba de
 *      verdad, en los bordes: 0/1, 15/16, 45/46. Los umbrales son los del
 *      proyecto original, que los describe en el texto de cada nivel.
 *
 *   2. TODA CONSULTA LLEVA EMPRESA Y MODO. No una, TODAS: se cuentan las
 *      consultas y los filtros, y tienen que dar el mismo numero. Sin el modo,
 *      la cartera de PRUEBA se suma a la real y el total no lo debe nadie.
 *
 *   3. DOS CONSULTAS, NO UNA POR FILA. Auditoria P2-28. Con 300 clientes, la
 *      diferencia entre 2 consultas y 601.
 *
 *   4. LO QUE NO SE SABE NO SE INVENTA. Los suplidores no tienen cupo de
 *      credito en la base: va `null`, no 0 -- que se leeria como "cupo cero",
 *      lo contrario de "no aplica". Y una variacion contra un mes de cero no
 *      es infinito por ciento: es que no hay comparacion, y se dice con null.
 *
 * OJO CON LA CONTRAPRUEBA: esto es codigo NUEVO, asi que "contra el HEAD
 * anterior fallan todas" es cierto pero no dice gran cosa -- los ficheros no
 * existian. Lo que de verdad se comprueba aqui es el comportamiento de
 * `nivelPorAtraso`, que se ejecuta, y la forma de las consultas.
 */
import { fuente as fuenteCruda } from './_fuente';
import { nivelPorAtraso, CONFIG_RIESGO, NIVELES } from '../src/services/cartera/riesgo';

const fuente = (r: string): string => fuenteCruda(r).replace(/\r\n/g, '\n');

let fallos = 0;
function ok(t: string, c: boolean): void {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!c) fallos++;
}

const veces = (s: string, sub: string): number => s.split(sub).length - 1;

// ─── 1. el riesgo, ejecutado de verdad ──────────────────────────────────
{
  ok('al dia es riesgo bajo, y lo que aun no vence tambien',
    nivelPorAtraso(0) === 'bajo' && nivelPorAtraso(-30) === 'bajo');

  // Los bordes, que es donde se equivocan estas reglas.
  ok('el primer dia de atraso ya no es bajo: 0 bajo, 1 medio',
    nivelPorAtraso(0) === 'bajo' && nivelPorAtraso(1) === 'medio');

  ok('15 sigue siendo medio, 16 es alto',
    nivelPorAtraso(15) === 'medio' && nivelPorAtraso(16) === 'alto');

  ok('45 sigue siendo alto, 46 es critico',
    nivelPorAtraso(45) === 'alto' && nivelPorAtraso(46) === 'critico');

  ok('un atraso largo es critico y no se sale de la escala',
    nivelPorAtraso(400) === 'critico' && nivelPorAtraso(10000) === 'critico');

  // Sin guarda, un NaN caeria en 'medio' por accidente de comparacion (`NaN <= 0`
  // es false). Con la guarda va a 'critico': un dato roto se enseña como algo
  // que hay que mirar, no como un cliente al dia. Y los infinitos caen donde
  // dicen: el negativo aun no vence, el positivo es atraso sin fondo.
  ok('un dato ilegible se enseña como algo que mirar, no como un cliente al dia',
    nivelPorAtraso(NaN) === 'critico'
    && nivelPorAtraso(Infinity) === 'critico'
    && nivelPorAtraso(-Infinity) === 'bajo');

  ok('los cuatro niveles tienen configuracion, y el criterio esta escrito',
    NIVELES.length === 4
    && NIVELES.every((n) => !!CONFIG_RIESGO[n] && CONFIG_RIESGO[n].key === n)
    && CONFIG_RIESGO.medio.criterio.includes('15')
    && CONFIG_RIESGO.alto.criterio.includes('45'));
}

// ─── 2. el repositorio ──────────────────────────────────────────────────
{
  const src = fuente('src/repositories/carteraRepository.ts');

  const consultas = veces(src, '.from(');
  const porEmpresa = veces(src, '.companyId, companyId)');
  const porModo = veces(src, '.modo, modo)');

  ok(`TODAS las consultas filtran por empresa y por modo (${consultas} consultas)`,
    consultas > 0 && consultas === porEmpresa && consultas === porModo);

  // Si alguien vuelve a meter un `await` dentro de un bucle sobre las filas,
  // esto deja de ser dos consultas.
  ok('el cruce se hace en memoria: el recorrido de filas no es asincrono',
    src.includes('return filas.map((f) => {')
    && !src.includes('filas.map(async')
    && !src.includes('for (const f of filas)'));

  ok('el riesgo sale de la funcion derivada, no de un campo guardado',
    src.includes("import { nivelPorAtraso") && src.includes('nivelPorAtraso(diasAtraso)')
    && !src.includes('riskLevel:'));

  // La cuota MAS atrasada, no un promedio: una factura de 60 dias es un
  // problema aunque las otras nueve esten al dia.
  ok('el atraso es el de la cuota mas atrasada CON saldo, no un promedio',
    src.includes('MAX(CASE WHEN') && src.includes('GREATEST(CURRENT_DATE')
    && !src.includes('AVG('));

  ok('los suplidores no fingen tener cupo de credito',
    src.includes('cupoCredito: conCupo ? Number(f.cupoCredito) || 0 : null'));

  ok('una variacion contra un mes de cero se dice con null, no con un numero',
    src.includes('variacion = previo === 0 ? null : ((monto - previo) / previo) * 100;'));

  ok('los seis meses salen siempre, con cero donde no hubo movimiento',
    src.includes('private static ultimosSeisMeses()')
    && src.includes('for (let i = 5; i >= 0; i--)')
    && src.includes('const monto = suyos.get(mes) ?? 0;'));

  ok('el detalle exige empresa y modo junto al id que viene de la URL',
    src.includes('static async detalle(')
    && src.includes('companyId: string,')
    && src.includes('entidadId: string'));
}

// ─── 3. las rutas ───────────────────────────────────────────────────────
{
  const lista = fuente('src/app/api/v1/cartera/route.ts');
  const detalle = fuente('src/app/api/v1/cartera/[id]/route.ts');

  ok('el tipo de cartera se valida con esquema, no con un if',
    lista.includes("z.enum(['clientes', 'suplidores']")
    && detalle.includes("z.enum(['clientes', 'suplidores']"));

  // Cobros no abre proveedores: cada cartera exige el permiso de SU modulo.
  ok('cada cartera exige el permiso de su propio modulo',
    lista.includes("clientes: 'cobros',") && lista.includes("suplidores: 'proveedores',")
    && lista.includes('MODULO[tipo],')
    && detalle.includes('MODULO[tipo],'));

  // El mapa va tipado con `PermissionModule`, no con `string`: asi un modulo mal
  // escrito lo caza el compilador y no `enforcePermission` en ejecucion, que es
  // donde un permiso equivocado deja de ser un error y pasa a ser un agujero.
  ok('el mapa de modulos esta tipado, no es un `string` cualquiera',
    lista.includes('Record<TipoCartera, PermissionModule>')
    && detalle.includes('Record<TipoCartera, PermissionModule>')
    && !lista.includes('Record<TipoCartera, string>')
    && !detalle.includes('Record<TipoCartera, string>'));

  ok('el id de la URL se valida como uuid antes de llegar a la consulta',
    detalle.includes(".uuid('La entidad no es válida.')"));

  ok('los dos catch dicen que cartera se estaba pidiendo',
    lista.includes("Logger.error('[cartera] no se pudo armar el resumen'")
    && detalle.includes("Logger.error('[cartera/detalle] no se pudo armar el estado de cuenta'")
    && !lista.includes('console.error') && !detalle.includes('console.error'));

  ok('las dos rutas pasan por limitador y por sesion',
    lista.includes("checkRateLimit(ip, 'standard')") && lista.includes('await verifyAuth(req)')
    && detalle.includes("checkRateLimit(ip, 'standard')") && detalle.includes('await verifyAuth(req)'));
}

console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLA(S)`);
process.exit(fallos === 0 ? 0 : 1);
