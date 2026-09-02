/**
 * firmaComprobante.vitest.ts
 *
 * Guarda de los hallazgos DB-22 y DB-23.
 *
 * El código de seguridad y la fecha de firma que devuelve mSeller no tenían
 * columna: vivían dentro del JSON de `dgii_submissions.response_payload`. Cada
 * consulta de estado sobrescribía ese JSON con la respuesta de la CONSULTA —que
 * no los trae— y además sin acotar por id de envío, de modo que pisaba el
 * payload de todos los intentos de la factura. Sincronizar una factura aceptada
 * le borraba los dos datos.
 *
 * Y al leerlos, se inventaban: cuatro rutas rellenaban el código con un
 * `sha256(id + ncf)` recortado a 16 caracteres, y ese invento entraba en el QR y
 * en la URL de consulta de la DGII del comprobante.
 *
 * A diferencia de las otras guardas de esta auditoría, la primera mitad de este
 * fichero ejecuta el extractor de verdad: la forma de la respuesta de mSeller
 * cambia según el endpoint, y ahí un examen del código no vale de nada.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { extraerFirma, camposDeFirma } from '@/services/dgii/estadoEnvio';

const RAIZ = join(__dirname, '..', '..');
const sinComentarios = (fuente: string) =>
  fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const leer = (rel: string) => sinComentarios(readFileSync(join(RAIZ, rel), 'utf8'));

describe('DB-22 · extraer la firma de lo que responda mSeller', () => {
  it('la encuentra en la raíz del envío', () => {
    expect(extraerFirma({ trackId: 'x', securityCode: 'A1B2C3D4', FechaHoraFirma: '20-08-2026 14:31:02' }))
      .toEqual({ codigoSeguridad: 'A1B2C3D4', fechaFirma: '20-08-2026 14:31:02', enlaceQr: null });
  });

  it('la encuentra anidada, con los nombres en español', () => {
    expect(extraerFirma({ data: { documento: { codigoSeguridad: 'ZZ99', fechaFirma: '01-09-2026' } } }))
      .toEqual({ codigoSeguridad: 'ZZ99', fechaFirma: '01-09-2026', enlaceQr: null });
  });

  it('la encuentra dentro de las cadenas JSON de dgiiResponse', () => {
    // mSeller devuelve `dgiiResponse` como array de cadenas, cada una un JSON.
    const raw = {
      ecf: 'E310000000001',
      dgiiResponse: ['{"estado":"Aceptado","codigoSeguridad":"QWE123","fechaFirma":"15-08-2026 09:10:00"}'],
    };
    expect(extraerFirma(raw)).toEqual({ codigoSeguridad: 'QWE123', fechaFirma: '15-08-2026 09:10:00', enlaceQr: null });
  });

  it('devuelve null cuando mSeller no la trae — nunca la calcula', () => {
    const vacio = { codigoSeguridad: null, fechaFirma: null, enlaceQr: null };
    expect(extraerFirma({ estado: 'Aceptado', mensajes: [] })).toEqual(vacio);
    expect(extraerFirma(null)).toEqual(vacio);
    expect(extraerFirma('respuesta de texto suelto')).toEqual(vacio);
  });

  it('trata el vacío como ausencia', () => {
    expect(extraerFirma({ securityCode: '   ', fechaFirma: '' }))
      .toEqual({ codigoSeguridad: null, fechaFirma: null, enlaceQr: null });
  });

  it('no se cuelga con referencias circulares', () => {
    const raw: any = { securityCode: 'OK1' };
    raw.self = raw;
    expect(extraerFirma(raw).codigoSeguridad).toBe('OK1');
  });

  it('recoge el enlace del QR sólo si es una URL', () => {
    expect(extraerFirma({ qrCode: 'https://ecf.dgii.gov.do/testecf/ConsultaTimbre?x=1' }).enlaceQr)
      .toBe('https://ecf.dgii.gov.do/testecf/ConsultaTimbre?x=1');
    expect(extraerFirma({ qr_url: 'http://ejemplo.do/q' }).enlaceQr).toBe('http://ejemplo.do/q');
    // mSeller devuelve a veces la imagen ya codificada. Eso no se guarda en la base.
    expect(extraerFirma({ qrCode: 'data:image/png;base64,iVBORw0KGgo=' }).enlaceQr).toBeNull();
  });

  it('camposDeFirma omite lo ausente, para no pisar un valor bueno con uno vacío', () => {
    expect(camposDeFirma({ securityCode: 'AAA' })).toEqual({ securityCode: 'AAA' });
    expect(camposDeFirma({ fechaFirma: '01-09-2026' })).toEqual({ signatureDate: '01-09-2026' });
    // Ésta es la clave: un objeto vacío en un `.set(...)` no toca nada.
    expect(camposDeFirma({ estado: 'Aceptado' })).toEqual({});
  });

  it('descarta valores más largos que la columna', () => {
    expect(camposDeFirma({ securityCode: 'X'.repeat(65) })).toEqual({});
    expect(camposDeFirma({ fechaFirma: 'Y'.repeat(41) })).toEqual({});
    expect(camposDeFirma({ qrCode: 'https://x.do/' + 'z'.repeat(2100) })).toEqual({});
  });
});

describe('DB-22 · la sincronización ya no borra la firma', () => {
  const RUTAS_SYNC = [
    'src/app/api/v1/ecf/[id]/dgii-status/route.ts',
    'src/app/api/v1/ecf/dgii-status/batch/route.ts',
  ];

  /**
   * El cuerpo de cada `.update(dgiiSubmissions).set({ ... })` de un fichero.
   *
   * Se mira el UPDATE y no el fichero entero a proposito: lo que arruinaba la
   * firma era REESCRIBIR el payload de un envio que ya existia. Cuando la
   * consulta descubre que la factura no tiene ningun envio registrado, insertar
   * uno CON su payload no destruye nada -- es la constancia que faltaba -- y
   * prohibirlo solo tiraria evidencia.
   */
  const setsDeEnvio = (fuente: string) => {
    const trozos: string[] = [];
    for (let i = fuente.indexOf('.update(dgiiSubmissions)'); i > -1;
         i = fuente.indexOf('.update(dgiiSubmissions)', i + 1)) {
      const fin = fuente.indexOf('.where(', i);
      trozos.push(fuente.slice(i, fin > -1 ? fin : fuente.length));
    }
    return trozos;
  };

  it('ninguna consulta de estado sobrescribe el payload del envío', () => {
    const culpables = RUTAS_SYNC.filter((r) =>
      setsDeEnvio(leer(r)).some((bloque) => bloque.includes('responsePayload:'))
    );
    expect(
      culpables,
      'El payload de un envío pertenece a ese envío. Una consulta de estado actualiza el estado y el ' +
        'mensaje; si reescribe el payload borra el código de seguridad, y además el WHERE no acota por ' +
        'id de envío, así que pisa todos los intentos de la factura.'
    ).toEqual([]);
  });

  it('las dos rutas guardan la firma en la factura', () => {
    for (const r of RUTAS_SYNC) {
      expect(leer(r), `${r}: falta persistir la firma`).toContain('camposDeFirma(');
    }
  });

  it('el envío y el reenvío también la guardan', () => {
    expect(leer('src/infrastructure/jobRunners.ts')).toContain('camposDeFirma(result.rawResponse)');
  });
});

describe('DB-23 · la firma se lee de la factura', () => {
  const LECTURAS: [string, string][] = [
    ['src/app/api/v1/invoices/[id]/route.ts', 'invoice'],
    ['src/app/api/v1/invoices/[id]/pdf/route.ts', 'invoice'],
    ['src/app/api/v1/invoices/[id]/email/route.ts', 'invoice'],
    ['src/app/api/v1/invoices/[id]/print/route.ts', 'invoiceRecordDb'],
  ];

  /*
   * Antes esta prueba exigia el bloque literal de treinta lineas que las cuatro
   * rutas repetian. Esas treinta lineas se unificaron en `firmaDelComprobante`,
   * y comprobar la forma del codigo habria obligado a volver a duplicarlas. Lo
   * que importa no es como se escribe, sino de donde sale el dato y en que
   * orden: la factura primero, el envio de respaldo. Eso es lo que se mira
   * ahora, y `firmaDelComprobante` lo fija en su firma -- la factura es el
   * primer argumento.
   */
  it('las cuatro rutas prefieren la columna antes que el JSON del envío', () => {
    for (const [ruta, variable] of LECTURAS) {
      const fuente = leer(ruta);
      expect(fuente, `${ruta}: la firma debe resolverse con firmaDelComprobante`)
        .toContain(`firmaDelComprobante(${variable}, submission)`);
      expect(
        fuente.includes('datosFirmaDeEnvio('),
        `${ruta}: leer solo del envío se salta la columna de la factura, que es la que ` +
          'no pisa ninguna sincronización'
      ).toBe(false);
    }
  });

  it('ninguna ruta fabrica el código de seguridad', () => {
    const culpables = LECTURAS.map(([r]) => r).filter((r) => leer(r).includes("createHash('sha256')"));
    expect(
      culpables,
      'Un sha256 de id + ncf no es el código de seguridad de la DGII: es un invento que entra en el QR ' +
        'y en la URL de consulta del comprobante, indistinguible de uno bueno para quien lo escanee.'
    ).toEqual([]);
  });

  // La comprobación de que el QR no se arma con datos inventados vivía aquí, y
  // exigía la guarda `!qrBase64 && securityCode && signedDate` del bloque que
  // construía la URL de la DGII a mano. Ese bloque se eliminó entero al corregir
  // DB-24: el enlace lo da mSeller y no se construye ninguno. La cobertura pasó a
  // las dos pruebas de DB-24 de más abajo, que son más estrictas — allí no se
  // comprueba con qué datos se arma la URL, sino que no se arma en absoluto.

  it('la fecha de firma no cae a la de creación', () => {
    for (const [ruta, variable] of LECTURAS.filter(([r]) => !r.endsWith('[id]/route.ts'))) {
      expect(
        leer(ruta).includes(`signedDate || ${variable}.createdAt`),
        `${ruta}: la fecha de creación no es la de firma; la DGII compara contra la suya`
      ).toBe(false);
    }
  });

  it('la plantilla tampoco la inventa', () => {
    const plantilla = leer('src/utils/templates/documentTemplates.ts');
    expect(
      plantilla.includes('inv.signatureDate || inv.createdAt).toLocaleString'),
      'Imprimía la fecha de creación bajo el rótulo "Fecha de Firma".'
    ).toBe(false);
  });

  // TENER LOS DATOS DE LA FIRMA NO ES ESTAR FIRMADO.
  //
  // Esta prueba pedía `const hayFirma = !!inv.signatureDate;`, y esa condición
  // resultó ser peligrosa: mSeller devuelve `securityCode`, `signatureDate` Y
  // `qr_url` AUNQUE la DGII rechace el comprobante. Comprobado en los datos de
  // producción del cliente:
  //
  //     E440000000001   rejected   código JW0T3M
  //     E440000000002   rejected   código CeCnNu
  //
  // Con la condición vieja, esos dos comprobantes RECHAZADOS se imprimían con
  // la leyenda "Firma Digital Válida" y su QR apuntando a la consulta de la
  // DGII. Un dato presente sólo significa que mSeller contestó.
  //
  // La leyenda sale del ESTADO FISCAL, y de nada más.
  it('la leyenda de firma sale del estado, no de que haya datos', () => {
    const plantilla = leer('src/utils/templates/documentTemplates.ts');
    expect(
      plantilla,
      'Un comprobante rechazado trae código y fecha de firma: colgar la validez de su presencia ' +
        'imprime un rechazo como firmado válido.'
    ).toContain("const hayFirma = inv.estadoFiscal === 'accepted'");
    expect(
      plantilla,
      'Y un rechazo tiene que distinguirse de un pendiente: no son lo mismo para quien recibe el papel.'
    ).toContain("const rechazado = inv.estadoFiscal === 'rejected'");
    expect(plantilla).toContain('RECHAZADO POR LA DGII');
    expect(
      plantilla.includes('const hayFirma = !!inv.signatureDate'),
      'La condición vieja no puede volver.'
    ).toBe(false);
    expect(
      plantilla.includes('const hayFirma = !!inv.securityCode'),
      'Ni su variante por código, que es el mismo error.'
    ).toBe(false);
  });

  it('el QR tampoco se imprime sin firma válida', () => {
    const plantilla = leer('src/utils/templates/documentTemplates.ts');
    // Las dos plantillas que lo pintan: la de carta y la de rollo.
    expect((plantilla.match(/hayFirma && qrBase64/g) || []).length).toBe(2);
  });

  it('getById devuelve las dos columnas', () => {
    const repo = leer('src/repositories/invoiceRepository.ts');
    const desde = repo.indexOf('static async getById');
    const seleccion = repo.slice(desde, repo.indexOf('.from(invoices)', desde));
    expect(desde).toBeGreaterThan(-1);
    expect(
      seleccion,
      'getById enumera las columnas una a una, y una lista explícita no falla al añadir una nueva: ' +
        'la ignora en silencio. El PDF, el correo y el detalle recibían undefined y el comprobante ' +
        'salía marcado como pendiente aunque la factura tuviera la firma guardada.'
    ).toContain('securityCode: invoices.securityCode');
    expect(seleccion).toContain('signatureDate: invoices.signatureDate');
  });

  it('ninguna ruta construye la URL de consulta de la DGII', () => {
    const culpables = LECTURAS.map(([r]) => r).filter((r) => leer(r).includes('ecf.dgii.gov.do'));
    expect(
      culpables,
      'El enlace del QR depende del ambiente y del tipo de comprobante, y lo da mSeller. La URL que se ' +
        'armaba a mano no es el endpoint de consulta de la DGII: el QR impreso llevaba a una dirección ' +
        'que no existe.'
    ).toEqual([]);
  });

  it('el QR sale del enlace guardado en la factura', () => {
    // Mismo motivo que arriba: el enlace se resuelve en `firmaDelComprobante`,
    // que mira `invoices.qr_url` antes que el payload del envio. Aqui se
    // comprueba que las rutas que imprimen usan ESE resultado y no otro.
    for (const [ruta] of LECTURAS.filter(([r]) => !r.endsWith('[id]/route.ts'))) {
      expect(leer(ruta), `${ruta}: el QR debe salir de la firma resuelta`)
        .toContain('firma.qr');
    }
    const repo = leer('src/repositories/invoiceRepository.ts');
    const desde = repo.indexOf('static async getById');
    expect(repo.slice(desde, repo.indexOf('.from(invoices)', desde))).toContain('qrUrl: invoices.qrUrl');
  });

  it('la columna existe en el esquema', () => {
    const esquema = leer('src/db/schema/invoices.ts');
    expect(esquema).toContain("securityCode: varchar('security_code'");
    expect(esquema).toContain("signatureDate: varchar('signature_date'");
    expect(esquema).toContain("qrUrl: text('qr_url')");
  });
});
