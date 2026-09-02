/**
 * entornoDgii.vitest.ts
 *
 * Guarda del hallazgo ISO-13.
 *
 * `entorno` no es una etiqueta: es un segmento de la URL con la que se habla con
 * mSeller —`${baseUrl}/${entorno}/documentos-ecf`—, de modo que `TesteCF` y
 * `eCF` son endpoints distintos y equivocarse manda el comprobante a la DGII
 * equivocada.
 *
 * Había cuatro copias de la resolución. Tres idénticas —en la cola y en las dos
 * rutas de consulta de estado— que sólo miraban `companySettings.dgiiEnv`, un
 * ajuste de EMPRESA, sin mirar el modo de la operación. Con la empresa en
 * producción, pulsar "Reenviar" estando en modo PRUEBA mandaba el comprobante a
 * la DGII de verdad, con un NCF de la secuencia de pruebas. La cuarta, dentro de
 * `invoiceSubmissionService`, era la única que respetaba el modo.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { entornoDgii } from '@/services/dgii/entorno';

const RAIZ = join(__dirname, '..', '..');
const SRC = join(RAIZ, 'src');
const sinComentarios = (fuente: string) =>
  fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

function ficheros(dir: string, acc: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    if (entrada === 'node_modules' || entrada === '.next' || entrada === 'tests') continue;
    const p = join(dir, entrada);
    if (statSync(p).isDirectory()) ficheros(p, acc);
    else if (entrada.endsWith('.ts') || entrada.endsWith('.tsx')) acc.push(p);
  }
  return acc;
}

describe('ISO-13 · el modo del sistema decide el ambiente, y nada más', () => {
  // EL CONTRATO CAMBIO, Y ESTAS PRUEBAS CON EL.
  //
  // Antes `entornoDgii(modo, dgiiEnv)` tomaba DOS cosas: el modo de la
  // operación y un ajuste de empresa. Dos interruptores para una decisión, que
  // podían contradecirse -- y se resolvían en silencio hacia pruebas por un
  // `return 'TesteCF'` final.
  //
  // Ahora manda el modo, uno a uno, y `company_settings.dgii_env` GUARDA ese
  // modo en vez de un ambiente aparte (migración 0047). Un modo desconocido
  // lanza: no hay ambiente por defecto al que caerse.
  //
  // Las aserciones viejas quedaron no sólo sin compilar sino al revés:
  // `entornoDgii('PRODUCCION', 'test') === 'TesteCF'` afirmaba justo la
  // contradicción que se ha eliminado.

  it('cada modo tiene un ambiente, y sólo uno', () => {
    expect(entornoDgii('PRUEBA')).toBe('TesteCF');
    expect(entornoDgii('CERTIFICACION')).toBe('CerteCF');
    expect(entornoDgii('PRODUCCION')).toBe('eCF');
  });

  it('en PRUEBA nunca se sale a la DGII real', () => {
    // Ya no hay un segundo ajuste que pueda empujar en otra dirección: esta
    // prueba pasó de comprobar que el modo GANABA a comprobar que es lo único
    // que hay.
    expect(entornoDgii('PRUEBA')).toBe('TesteCF');
  });

  it('un modo que no se reconoce LANZA, no cae a un ambiente', () => {
    // El fallo original era un `return 'TesteCF'` al final de la cadena: una
    // empresa en producción con un ajuste que nadie entendía emitía contra
    // pruebas sin avisar. Fallar aquí es ruidoso y se arregla; lo otro no se
    // descubre hasta que la DGII reclama.
    for (const malo of [null, undefined, '', 'PRODUCTION', 'test', 'lo-que-sea']) {
      expect(
        () => entornoDgii(malo as any),
        `modo=${JSON.stringify(malo)}: sin modo válido no hay ambiente`
      ).toThrow();
    }
  });

  it('no queda ninguna copia suelta de la resolución', () => {
    const culpables = ficheros(SRC)
      .filter((f) => !f.endsWith(join('dgii', 'entorno.ts')))
      .filter((f) => /resolveEntorno/.test(sinComentarios(readFileSync(f, 'utf8'))))
      .map((f) => relative(RAIZ, f).split('\\').join('/'));

    expect(
      culpables,
      'La resolución del entorno vive en un solo sitio: src/services/dgii/entorno.ts. Una copia que ' +
        'olvide el modo manda comprobantes de prácticas a la DGII real.'
    ).toEqual([]);
  });

  it('los cinco caminos que hablan con mSeller pasan el modo', () => {
    const CAMINOS = [
      'src/infrastructure/jobRunners.ts',
      'src/app/api/v1/ecf/[id]/dgii-status/route.ts',
      'src/app/api/v1/ecf/dgii-status/batch/route.ts',
      'src/app/api/v1/invoices/[id]/xml/route.ts',
      'src/services/invoice/invoiceSubmissionService.ts',
    ];
    for (const ruta of CAMINOS) {
      const fuente = sinComentarios(readFileSync(join(RAIZ, ruta), 'utf8'));
      expect(fuente, `${ruta}: debe resolver el entorno con entornoDgii`).toContain('entornoDgii(');
      // El primer argumento es el modo. Sin el, la funcion ni siquiera compila,
      // pero la asercion documenta cual de los tres modos usa cada camino.
      expect(
        /entornoDgii\(\s*(auth\.modo|data\.modo|modo)\b/.test(fuente),
        `${ruta}: el primer argumento tiene que ser el modo de la operación`
      ).toBe(true);
    }
  });

  it('ninguna instanciación del cliente arma el entorno por su cuenta', () => {
    const culpables = ficheros(SRC)
      .filter((f) => {
        const c = sinComentarios(readFileSync(f, 'utf8'));
        return c.includes('new MSellerClient') && !c.includes('entornoDgii(');
      })
      .map((f) => relative(RAIZ, f).split('\\').join('/'));
    expect(culpables, 'Todo cliente de mSeller resuelve su entorno con entornoDgii.').toEqual([]);
  });
});

describe('ISO-14 · las credenciales de mSeller son de la empresa, de nadie más', () => {
  it('ninguna ruta las toma de variables de entorno', () => {
    const culpables = ficheros(SRC)
      .filter((f) =>
        /process\.env\.MSELLER_(EMAIL|PASSWORD|API_KEY|ENTORNO|BASE_URL)/.test(
          sinComentarios(readFileSync(f, 'utf8'))
        )
      )
      .map((f) => relative(RAIZ, f).split('\\').join('/'));

    expect(
      culpables,
      'Un respaldo global de credenciales hace que una empresa sin las suyas envíe los comprobantes ' +
        'con la cuenta de mSeller de OTRA, y sin fallar: quedan registrados ante la DGII en la cuenta ' +
        'equivocada. Sin credenciales propias hay que fallar y decir que se configuren.'
    ).toEqual([]);
  });
});

describe('ISO-13 · un solo ajuste decide el ambiente fiscal', () => {
  it('la columna duplicada no queda en ninguna parte', () => {
    const culpables = ficheros(SRC)
      .filter((f) => sinComentarios(readFileSync(f, 'utf8')).includes('msellerEntorno'))
      .map((f) => relative(RAIZ, f).split('\\').join('/'));

    expect(
      culpables,
      'Había dos ajustes con el mismo significado y sólo uno mandaba (`dgiiEnv`). Dos ajustes donde ' +
        'uno decide y el otro decora es cómo se acaba cambiando el equivocado.'
    ).toEqual([]);
  });

  it('cambiar el ambiente fiscal exige rol de sistemas', () => {
    const ruta = sinComentarios(
      readFileSync(join(RAIZ, 'src/app/api/v1/admin/settings/route.ts'), 'utf8')
    );
    expect(
      ruta,
      'La pantalla deshabilita el selector para quien no es sistemas, pero eso no protege nada: ' +
        'bastaba una petición a mano para pasar la empresa a producción y que la siguiente factura ' +
        'se emitiera de verdad. Lo que protege es el servidor.'
    ).toContain('const isEntornoChanged = dgiiEnv !== undefined && dgiiEnv !== currentSettings?.dgiiEnv;');
    expect(ruta).toMatch(/if \(isUrlChanged \|\| isEntornoChanged/);
  });
});

describe('ISO-16 · cada ambiente tiene sus propias credenciales', () => {
  it('el resolvedor no tiene respaldo de ningún tipo', () => {
    const fuente = sinComentarios(
      readFileSync(join(RAIZ, 'src/services/dgii/credenciales.ts'), 'utf8')
    );
    expect(fuente).toContain('msellerApiKeys');
    expect(
      /process\.env/.test(fuente),
      'Unas credenciales que aparecen de la nada mandan comprobantes fiscales a la cuenta equivocada.'
    ).toBe(false);
    expect(
      fuente,
      'Si no hay clave de API para ese ambiente hay que fallar, no caer a la de otro.'
    ).toMatch(/if \(!clave\?\.apiKeyEncrypted\)[\s\S]{0,400}throw new Error/);
  });

  it('los cinco caminos piden las credenciales del entorno resuelto', () => {
    const CAMINOS = [
      'src/infrastructure/jobRunners.ts',
      'src/app/api/v1/ecf/[id]/dgii-status/route.ts',
      'src/app/api/v1/ecf/dgii-status/batch/route.ts',
      'src/app/api/v1/invoices/[id]/xml/route.ts',
      'src/services/invoice/invoiceSubmissionService.ts',
    ];
    for (const ruta of CAMINOS) {
      const fuente = sinComentarios(readFileSync(join(RAIZ, ruta), 'utf8'));
      expect(fuente, `${ruta}: debe pedir las credenciales del entorno`).toContain('credencialesMseller(');
      expect(
        fuente,
        `${ruta}: las credenciales se piden PARA el entorno ya resuelto, así que entornoDgii va antes`
      ).toMatch(/entornoDgii\([\s\S]*?credencialesMseller\(/);
    }
  });

  it('el usuario y la contraseña NO se duplican por ambiente', () => {
    const esquema = sinComentarios(
      readFileSync(join(RAIZ, 'src/db/schema/companies.ts'), 'utf8')
    );
    const desde = esquema.indexOf("pgTable('mseller_api_keys'");
    expect(desde).toBeGreaterThan(-1);
    const tabla = esquema.slice(desde, esquema.indexOf('}));', desde));
    expect(
      /email|password/i.test(tabla),
      'Sólo la clave de API cambia entre ambientes. Duplicar el usuario y la contraseña los expone a ' +
        'desincronizarse: un cambio aplicado en dos ambientes de tres deja el tercero roto sin que ' +
        'nadie se entere hasta que falla un envío.'
    ).toBe(false);
  });

  it('ninguna ruta lee ya la clave de API vieja de company_settings', () => {
    const culpables = ficheros(SRC)
      .filter((f) => {
        const c = sinComentarios(readFileSync(f, 'utf8'));
        // Sólo los secretos. `settings?.msellerEmail` se usa además, en las rutas
        // de impresión, como correo de contacto de la empresa: es otro asunto y
        // no es una credencial.
        // `msellerPasswordEncrypted` sigue siendo legítimo: la contraseña es de
        // la empresa y vive ahí. Lo que no puede quedar es la clave de API.
        return /msellerApiKeyEncrypted/.test(c);
      })
      .map((f) => relative(RAIZ, f).split('\\').join('/'))
      // El esquema declara las columnas viejas, que se borran en una migración
      // posterior, cuando los dos ambientes estén configurados y funcionando.
      .filter((f) => !f.endsWith('db/schema/companies.ts'));

    expect(
      culpables,
      'Las credenciales viven en mseller_credentials, con clave (empresa, ambiente).'
    ).toEqual([]);
  });
});
