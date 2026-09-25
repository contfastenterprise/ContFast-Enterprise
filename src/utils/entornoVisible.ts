/**
 * Como se enseña el entorno en el que se esta operando.
 *
 * POR QUE ESTE FICHERO (lote 192)
 * -------------------------------
 * El dueño pidio que la leyenda de PRODUCCION/PRUEBA se fuera del pie del menu
 * al lado de la campana, **sin texto pero con hover**. Al ir a hacerlo salio que
 * el mismo dato se enseñaba en tres sitios, y no de la misma forma:
 *
 *   · la franja rayada de arriba, solo en PRUEBA ("OPERACIONES FISCALMENTE
 *     NULAS");
 *   · una pastilla "SANDBOX" al lado de la campana, solo en PRUEBA;
 *   · un bloque en el pie del menu, que es el UNICO que decia algo en
 *     PRODUCCION.
 *
 * Y los dos estados de los que salian -- `entorno` y `activeEnvironment` -- son
 * el mismo valor: `ClientLayout` los fija en la misma vuelta desde
 * `initialSettings.dgiiEnv` (lineas 129 y 142). O sea que **eran tres vistas de
 * un dato, con tres formas distintas de decirlo**.
 *
 * Aqui queda UNA regla, que es lo que se puede probar. El aspecto (la franja, el
 * punto, el globo) es de las pantallas; **que color y que texto le corresponden a
 * cada entorno** es de aqui.
 *
 * CERT ESTA MUERTO, y se deja a proposito. `dgiiEnv` solo puede valer PRODUCCION
 * o PRUEBA -- CERTIFICACION se rechaza al guardar y en el alta -- y el propio
 * `ClientLayout` manda a PRUEBA todo lo que no sea PRODUCCION, asi que hoy nadie
 * puede llegar con 'CERT'. Se mantiene porque el tipo lo admite y porque una
 * pantalla que reciba un valor que no espera **no puede quedarse sin rotulo**: un
 * punto sin color ni texto seria peor que decir "Certificacion".
 *
 * Fichero puro y sin imports: la regla tiene que poder ejecutarse en un banco, y
 * dentro de un componente con `'use client'` no se puede (leccion del lote 190).
 */

export type Entorno = 'TEST' | 'CERT' | 'PROD';

export interface RotuloDeEntorno {
  /** Lo que se lee al pasar por encima. Corto, porque es un globo. */
  titulo: string;
  /** La consecuencia, que es el dato que de verdad importa. */
  detalle: string;
  /** Clases del punto de color. La forma la pone la pantalla. */
  clasePunto: string;
  /** Para lo que tenga que distinguir de verdad, no para pintar. */
  esProduccion: boolean;
}

/**
 * El rotulo de un entorno.
 *
 * DONDE SE CAMBIA, en los que no son produccion: la pastilla "SANDBOX" que este
 * lote retira tenia un clic que sacaba un toast -- "el ambiente esta enlazado a la
 * configuracion de la empresa" --, y ese dato no se puede perder al quitarla. Va
 * en el globo, que sale sin tener que pulsar. En produccion no hace falta: nadie
 * necesita instrucciones para seguir donde debe estar.
 *
 * EL DETALLE DICE LA CONSECUENCIA, no el nombre otra vez. "Pruebas" no le dice a
 * nadie que lo que emita no vale ante la DGII, y eso es justo lo que hay que
 * saber antes de facturar. Es la misma razon por la que la franja de arriba dice
 * "operaciones fiscalmente nulas" y no "sandbox".
 */
export function rotuloDelEntorno(entorno: Entorno): RotuloDeEntorno {
  if (entorno === 'PROD') {
    return {
      titulo: 'Producción',
      detalle: 'Lo que emitas tiene validez fiscal ante la DGII.',
      //  Verde con resplandor, el mismo que llevaba el pie del menu: quien ya
      //  conocia esa luz la reconoce en el sitio nuevo.
      clasePunto: 'bg-emerald-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]',
      esProduccion: true,
    };
  }
  if (entorno === 'CERT') {
    return {
      titulo: 'Certificación',
      detalle: 'Entorno de certificación de la DGII. Sin validez fiscal. Se cambia en la configuración de la empresa.',
      clasePunto: 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]',
      esProduccion: false,
    };
  }
  return {
    titulo: 'Pruebas',
    detalle: 'Modo prueba: las operaciones son fiscalmente nulas. Se cambia en la configuración de la empresa.',
    clasePunto: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]',
    esProduccion: false,
  };
}
