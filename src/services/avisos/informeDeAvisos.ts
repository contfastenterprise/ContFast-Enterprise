/**
 * Lote 205 -- arma el informe de avisos y lo dibuja en PDF.
 *
 * Este modulo es el que ORQUESTA: pide la serie a la base, la completa, dibuja el grafico,
 * pinta el HTML con la plantilla de casa y llama al navegador. Cada una de esas cuatro
 * cosas vive en su sitio, y aqui solo se enlazan -- lo que permite que las dos con
 * aritmetica (`graficoDeBarras` y `movimientoDeLosDias`) se prueben sin base de datos y
 * sin navegador.
 *
 * LOS DATOS DE LA EMPRESA salen de `ReportRepository.getCompanyInfo`, que es de donde los
 * saca cualquier otro informe impreso. No se vuelven a consultar a mano: si mañana la
 * cabecera necesita otro campo, se añade en un sitio.
 *
 * EL COSTE, MEDIDO Y DICHO: dibujar un PDF arranca Chromium, y en esta aplicacion eso son
 * ~3,2 s en instancia nueva (medido en PRODUCCION el 2026-09-23, linea `[tiempos-pdf]`).
 * Por eso esto corre dentro de `after()` -- el panel ya respondio -- y por eso la ruta del
 * panel declara `maxDuration`: sin el, el plazo de la funcion podria cortar el dibujo a
 * medias y el aviso se quedaria sin salir sin decir por que.
 */
import { Logger } from '@/utils/logger';
import { PdfGenerator as PuppeteerPdfGenerator } from '@/services/print/pdfGenerator';
import { DocumentTemplates } from '@/utils/templates/documentTemplates';
import { ReportRepository } from '@/repositories/reportRepository';
import type { ModoOperativo } from '@/services/dgii/modoPeticion';
import type { AvisoDelPanel } from '@/services/avisos/sincronizarAvisos';
import { severidadDelAviso } from '@/services/avisos/avisoPorCorreo';
import { graficoDeBarrasSvg } from '@/services/avisos/graficoDeBarras';
import {
  DIAS_DEL_INFORME,
  diaDelInforme,
  diasDelPeriodo,
  serieConTodosLosDias,
  totalesDelDia,
} from '@/services/avisos/movimientoDeLosDias';
import { movimientoPorDia } from '@/services/avisos/consultaDeMovimiento';

export interface DatosDelInforme {
  companyId: string;
  modo: ModoOperativo;
  empresa: string;
  avisos: readonly AvisoDelPanel[];
  /** Desde cuando esta pendiente cada aviso, por su clave. Puede venir vacio. */
  desdeCuando?: ReadonlyMap<string, Date>;
}

/**
 * El HTML del informe. Separado del PDF a proposito: es la parte que se puede comprobar
 * sin arrancar un navegador, y es donde estan las decisiones que se pueden equivocar.
 */
export async function informeDeAvisosHtml(datos: DatosDelInforme): Promise<string> {
  const hasta = diaDelInforme();
  const dias = diasDelPeriodo(hasta, DIAS_DEL_INFORME);
  const desde = dias[0] ?? hasta;

  //  La consulta y la ficha de la empresa, en paralelo: son independientes y el pool de
  //  produccion tiene `max: 2` (es el criterio del lote 182).
  const [filas, empresaInfo] = await Promise.all([
    movimientoPorDia(datos.companyId, datos.modo, desde, hasta),
    ReportRepository.getCompanyInfo(datos.companyId),
  ]);

  const serie = serieConTodosLosDias(dias, filas);
  const grafico = graficoDeBarrasSvg(serie, { destacado: hasta });

  return DocumentTemplates.renderAlertsReport({
    //  Si la ficha no viene, se pinta lo que se sabe: el nombre de la empresa, que llega
    //  del propio envio. Un informe sin cabecera es peor que uno con media cabecera, y
    //  NO se inventan datos -- un RNC de relleno en un documento con el nombre de la
    //  empresa es exactamente lo que no debe pasar.
    company: {
      name: empresaInfo?.name ?? datos.empresa,
      rnc: empresaInfo?.rnc ?? '',
      address: empresaInfo?.address ?? '',
      phone: empresaInfo?.phone ?? '',
      logoUrl: empresaInfo?.logoUrl ?? null,
    },
    dia: hasta,
    //  EL ENTORNO SE DICE cuando no es produccion: un informe de PRUEBA con cifras de
    //  practicas es indistinguible de uno real si no lo lleva escrito.
    entorno: datos.modo === 'PRODUCCION' ? undefined : 'PRUEBA',
    avisos: datos.avisos.map((a) => ({
      titulo: a.title,
      descripcion: a.description,
      severidad: severidadDelAviso(a.type),
      desdeCuando: datos.desdeCuando?.get(a.id)?.toISOString() ?? null,
    })),
    grafico,
    totalesDelDia: totalesDelDia(serie),
    periodo: { desde, hasta },
  });
}

/**
 * El informe en PDF. `carta`, como los demas informes de la aplicacion.
 *
 * LANZA si no se puede dibujar, y eso es a proposito: quien llama decide. El envio de
 * avisos lo atrapa y manda el correo sin adjunto -- el PDF es presentacion, los avisos son
 * la informacion, y perder la segunda por la primera seria el peor cambio posible.
 */
export async function informeDeAvisosPdf(datos: DatosDelInforme): Promise<Buffer> {
  const comenzo = Date.now();
  const html = await informeDeAvisosHtml(datos);
  const pdf = await PuppeteerPdfGenerator.generatePdfFromHtml(html, 'carta');
  Logger.info('[avisos-correo] informe dibujado', {
    companyId: datos.companyId,
    avisos: datos.avisos.length,
    ms: Date.now() - comenzo,
    bytes: pdf.length,
  });
  return pdf;
}
