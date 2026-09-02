/**
 * datosDeContacto.vitest.ts
 *
 * Guarda del hallazgo ISO-17.
 *
 * Los documentos impresos rellenaban los datos de contacto que faltaban con
 * valores cableados, y en tres sitios con una rama que detectaba una empresa
 * concreta por su RNC:
 *
 *     const isLatinDoors = company.name.toLowerCase().includes('doors')
 *                          || company.rnc === '132796845';
 *     const tel   = company.phone   || (isLatinDoors ? '1-829-214-4128' : '809-555-0199');
 *     const email = company.email   || (isLatinDoors ? 'latindoors@gmail.com' : 'info@contfast.com');
 *     const dir   = company.address || (isLatinDoors ? 'Hato del Yaque, Santiago R.D.' : 'Santo Domingo, R.D.');
 *
 * En un sistema multiempresa eso imprime el teléfono, el correo y la dirección
 * de OTRA empresa en un comprobante fiscal. Y cualquier empresa cuyo nombre
 * contuviera "doors" heredaba los datos ajenos sin más.
 *
 * Otras seis rutas ponían `phone: '1-809-555-0199'` fijo, sin mirar siquiera la
 * empresa, y dos usaban el correo de acceso a mSeller —un usuario, no una
 * dirección de contacto— como correo del comprobante.
 *
 * La regla: un documento lleva los datos de SU empresa, o no lleva ninguno. Un
 * dato de contacto inventado es peor que un hueco, porque el hueco se ve y se
 * corrige.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

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

/** Los valores concretos que estaban cableados. */
const CABLEADOS = [
  'latindoors@gmail.com',
  'info@contfast.com',
  '1-829-214-4128',
  '809-555-0199',
  'Hato del Yaque',
];

describe('ISO-17 · un documento lleva los datos de su empresa o ninguno', () => {
  it('no queda ningún dato de contacto cableado', () => {
    const culpables: string[] = [];

    for (const f of ficheros(SRC)) {
      const rel = relative(RAIZ, f).split('\\').join('/');
      const codigo = sinComentarios(readFileSync(f, 'utf8'));
      for (const valor of CABLEADOS) {
        // Los `placeholder` de un formulario son ejemplos para el usuario, no
        // datos que se impriman: ésos sí pueden llevar un número de muestra.
        const lineas = codigo.split('\n').filter((l) => l.includes(valor));
        if (lineas.some((l) => !/placeholder=/.test(l))) {
          culpables.push(`${rel} — ${valor}`);
        }
      }
    }

    expect(
      culpables,
      'Un valor de contacto cableado acaba impreso en el comprobante fiscal de una empresa que no ' +
        'es la suya.'
    ).toEqual([]);
  });

  it('no queda ninguna rama que reconozca a una empresa concreta', () => {
    const culpables = ficheros(SRC)
      .filter((f) => /isLatinDoors|rnc === '132796845'/.test(sinComentarios(readFileSync(f, 'utf8'))))
      .map((f) => relative(RAIZ, f).split('\\').join('/'));

    expect(
      culpables,
      'El código no puede reconocer a un cliente por su RNC para darle un trato distinto: cualquier ' +
        'otra empresa que coincida con la condición hereda sus datos.'
    ).toEqual([]);
  });

  it('el correo de mSeller no se usa como correo del comprobante', () => {
    const culpables = ficheros(SRC)
      .filter((f) => /email:\s*(company\.email\s*\|\|\s*)?settings\??\.\s*msellerEmail/.test(
        sinComentarios(readFileSync(f, 'utf8'))
      ))
      .map((f) => relative(RAIZ, f).split('\\').join('/'));

    expect(
      culpables,
      'El correo de mSeller es un usuario de acceso, no una dirección de contacto de la empresa.'
    ).toEqual([]);
  });
});
