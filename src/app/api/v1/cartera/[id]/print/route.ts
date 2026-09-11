import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, companySettings } from '@/db';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission, type PermissionModule } from '@/middleware/permissions';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { ReportRepository } from '@/repositories/reportRepository';
import { DocumentTemplates } from '@/utils/templates/documentTemplates';
import { PdfGenerator } from '@/services/print/pdfGenerator';
import { Logger } from '@/utils/logger';
import { CarteraRepository, type TipoCartera } from '@/repositories/carteraRepository';
import { AVISO_CREDITO } from '@/components/cartera/tipos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * El estado de cuenta impreso de este panel: PARTIDAS ABIERTAS POR NCF.
 *
 * No es un libro de movimientos. Cada linea es UNA FACTURA que sigue debiendo,
 * y lo que le paso -- abonos, notas de credito, notas de debito -- va en
 * columnas de esa misma linea. Un recibo no tiene renglon propio: aparece
 * rebajando la factura a la que se aplico. Y lo saldado no sale: una factura
 * cobrada no es parte de un estado de cuenta, es historia.
 *
 * Es un documento DISTINTO del que imprimen las rutas de
 * `financial/statements`, que si son un libro de movimientos y siguen donde
 * estaban. Son dos papeles a proposito, no un descuido: conviene saber que son
 * dos, porque tocar uno no arregla el otro.
 *
 * DEVUELVE UN PDF, no HTML
 * ------------------------
 * El mismo HTML de la plantilla pasa por `PdfGenerator.generatePdfFromHtml`,
 * que es el generador que ya usa el resto del sistema (Puppeteer en local, o el
 * servicio externo si esta configurado). El formato es identico porque el
 * origen es identico: no hay una segunda plantilla que pueda separarse de la
 * primera.
 *
 * Va `inline` y no `attachment`: se abre en el visor del navegador, con su
 * boton de imprimir y el de guardar a un clic. Un estado de cuenta se mira
 * antes de mandarlo, casi siempre.
 *
 * SI EL PDF FALLA, NO SE DEVUELVE UN ERROR EN BLANCO
 * -------------------------------------------------
 * Generar un PDF depende de un navegador sin ventana que puede no arrancar. En
 * ese caso se devuelve el MISMO documento en HTML, con un aviso arriba que dice
 * que el PDF no se pudo generar y que eso que estas viendo se imprime con
 * Ctrl+P. El fallo queda en el log, con su motivo. Lo que no se hace es
 * devolver un 500 y dejar a quien tenia que entregar un estado de cuenta sin
 * nada -- ni, al reves, servir HTML en silencio como si fuera lo pedido.
 */
const esquema = z.object({
  tipo: z.enum(['clientes', 'suplidores'], {
    message: 'El tipo de cartera debe ser "clientes" o "suplidores".',
  }),
  id: z.string({ message: 'Falta la entidad.' }).uuid('La entidad no es válida.'),
});

const MODULO: Record<TipoCartera, PermissionModule> = {
  clientes: 'cobros',
  suplidores: 'proveedores',
};

/**
 * La capa que aprieta el documento.
 *
 * POR QUE UNA CAPA Y NO TOCAR LA PLANTILLA
 * ----------------------------------------
 * `renderCustomerFinancialStatement` la usan tambien las rutas de
 * `financial/statements`, que imprimen OTRO documento para otra pantalla.
 * Apretar la plantilla habria apretado tambien aquel, que nadie pidio tocar. La
 * capa va solo por aqui, y el contenido no cambia: lo que cambia es cuanto cabe
 * en cada hoja.
 *
 * Dos cosas de aqui no son estetica:
 *
 *   - `thead { display: table-header-group }` repite la cabecera de la tabla en
 *     CADA pagina. Sin eso, la segunda hoja de un estado largo es una columna
 *     de numeros sin decir cual es debito y cual credito.
 *
 *   - `tr { page-break-inside: avoid }` impide que una linea quede partida por
 *     la mitad entre dos hojas.
 */
const ESTILO_COMPACTO = `
  <style>
    @page { margin: 10mm 9mm; }
    body { font-size: 8pt !important; line-height: 1.25 !important; }
    .header { margin-bottom: 8px !important; }
    .logo { max-height: 42px !important; }
    .subtitle { font-size: 12pt !important; margin-bottom: 4px !important; }
    h4 { margin-top: 10px !important; margin-bottom: 6px !important; font-size: 9pt !important; padding-bottom: 3px !important; }
    table { font-size: 7.5pt !important; }
    table th, table td { padding: 2px 4px !important; }
    .summary-card {
      padding: 5px 9px !important;
      min-width: 104px !important;
      margin-right: 5px !important;
      margin-bottom: 5px !important;
    }
    .footer { margin-top: 18px !important; font-size: 7pt !important; }

    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
  </style>
`;

/** Mete la capa justo antes de `</head>`, para que gane a la de la plantilla. */
function comprimir(html: string): string {
  return html.includes('</head>')
    ? html.replace('</head>', `${ESTILO_COMPACTO}</head>`)
    : ESTILO_COMPACTO + html;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const allowed = await checkRateLimit(ip, 'standard');
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiadas peticiones. Intente más tarde.' } },
        { status: 429 }
      );
    }

    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'No autorizado' } },
        { status: 401 }
      );
    }

    const { id } = await params;
    const validacion = esquema.safeParse({
      tipo: req.nextUrl.searchParams.get('tipo') ?? undefined,
      id,
    });
    if (!validacion.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: validacion.error.issues[0]?.message || 'Consulta inválida.' },
        },
        { status: 400 }
      );
    }

    const { tipo, id: entidadId } = validacion.data;

    await enforcePermission(
      session.userId,
      session.role,
      session.roleId,
      session.companyId,
      MODULO[tipo],
      'read'
    );

    const empresa = await ReportRepository.getCompanyInfo(session.companyId);
    if (!empresa) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Empresa no encontrada.' } },
        { status: 404 }
      );
    }

    const [ajustes] = await db
      .select()
      .from(companySettings)
      .where(eq(companySettings.companyId, session.companyId))
      .limit(1);

    // El membrete se arma igual que en las demas impresiones del sistema.
    const membrete = {
      name: empresa.name,
      rnc: empresa.rnc,
      address: empresa.address || 'República Dominicana',
      phone: empresa.phone || '',
      logoUrl: ajustes?.logoUrl || undefined,
    };

    // La empresa y el modo van SIEMPRE: el id llega de la URL, y este documento
    // se imprime y se entrega -- imprimir el de otra empresa no seria un error
    // de pantalla, seria un papel con datos ajenos encima de una mesa.
    // La empresa y el modo van SIEMPRE con el id: el id llega de la URL, y este
    // documento se imprime y se entrega -- imprimir el de otra empresa no seria
    // un error de pantalla, seria un papel con datos ajenos encima de una mesa.
    const entidad = await CarteraRepository.datosEntidad(session.companyId, tipo, entidadId);
    if (!entidad) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'No se encontró esa cuenta en esta empresa.' } },
        { status: 404 }
      );
    }

    const partidas = await CarteraRepository.estadoPorNcf(
      session.companyId,
      session.modo,
      tipo,
      entidadId
    );

    const nombreEntidad = entidad.name;
    const html = DocumentTemplates.renderEstadoPorNcf({
      company: membrete,
      entidad,
      esCliente: tipo === 'clientes',
      partidas,
      // La misma frase que la pantalla. Escrita una vez: si el papel y la
      // pantalla dijeran cosas distintas sobre el plazo, ninguna valdria.
      aviso: AVISO_CREDITO,
    });

    // Solo letras, numeros y guiones: un nombre con tildes o comas dentro de
    // una cabecera HTTP es una cabecera rota.
    const nombreLimpio = (nombreEntidad || 'Estado')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60) || 'Estado';
    const fichero = `Estado_Cuenta_${nombreLimpio}_${new Date().toISOString().slice(0, 10)}.pdf`;

    try {
      const pdf = await PdfGenerator.generatePdfFromHtml(comprimir(html), 'carta');
      return new NextResponse(new Uint8Array(pdf), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${fichero}"`,
          // Un estado de cuenta caduca en cuanto entra un cobro: no se cachea.
          'Cache-Control': 'no-store, max-age=0',
        },
      });
    } catch (pdfErr: unknown) {
      Logger.error('[cartera/print] no se pudo generar el PDF; se devuelve el HTML imprimible', {
        tipo,
        entidadId,
        motivo: (pdfErr as Error)?.message,
      });

      // El aviso va DENTRO del documento y no en una cabecera: quien lo abre
      // tiene que verlo, y tiene que desaparecer al imprimirlo para que no
      // acabe en el papel que se entrega.
      const aviso = `
        <style>@media print { .aviso-pdf { display: none !important; } }</style>
        <div class="aviso-pdf" style="background:#fef3c7;border:1px solid #fcd34d;color:#78350f;padding:10px 14px;margin:0 0 14px;border-radius:8px;font-family:sans-serif;font-size:12px;">
          <strong>No se pudo generar el PDF.</strong> Este es el mismo estado de cuenta en versión
          imprimible: usa Ctrl+P para imprimirlo o guardarlo como PDF. El motivo quedó registrado.
        </div>`;
      const base = comprimir(html);
      const htmlConAviso = base.includes('<body>')
        ? base.replace('<body>', `<body>${aviso}`)
        : aviso + base;

      return new NextResponse(htmlConAviso, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store, max-age=0',
        },
      });
    }
  } catch (error: unknown) {
    Logger.error('[cartera/print] no se pudo armar el estado de cuenta impreso', {
      tipo: req.nextUrl.searchParams.get('tipo'),
      motivo: (error as Error)?.message,
    });
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: (error as Error).message } },
      { status: 500 }
    );
  }
}
