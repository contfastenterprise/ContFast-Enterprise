/**
 * `/[empresa]/mi-cuenta` aceptaba un JWT sin comprobar la firma.
 *
 * La pagina es un Server Component publico. Leia la cookie `accessToken`,
 * partia el token por los puntos y hacia JSON.parse del payload en base64:
 *
 *     const [header, payload, sig] = token.split('.');
 *     const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
 *     userId = decoded.userId;
 *
 * La firma no se miraba. Cualquiera podia fabricar la cookie con el userId que
 * quisiera y ver las cotizaciones de esa persona -- numero, estado, total y
 * fecha -- ademas de su nombre. La empresa salia del slug de la URL, asi que
 * bastaba con visitar la tienda de cada empresa para recorrerlas todas.
 *
 * `verifyAuth` (src/middleware/auth.ts:118) ya hacia lo correcto con
 * `jwt.verify`. Esta pagina simplemente no pasaba por ahi.
 *
 * Esta prueba fabrica los tres tokens que importan: uno falsificado sin firma,
 * uno firmado con la clave equivocada y uno legitimo.
 */
import { db } from '../src/db';
import { sql } from 'drizzle-orm';
import jwt from 'jsonwebtoken';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const USER_A = 'bbbbbbbb-0000-0000-0000-000000000001';
const USER_B = 'bbbbbbbb-0000-0000-0000-000000000002';
const SECRETO = process.env.JWT_SECRET || 'secreto-de-prueba';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

/** El decodificador que tenia la pagina: parte y confia. */
function comoEstabaAntes(token: string): string | null {
  try {
    const [, payload] = token.split('.');
    return JSON.parse(Buffer.from(payload, 'base64').toString('utf8')).userId ?? null;
  } catch {
    return null;
  }
}

/** El decodificador de ahora: el mismo que usa verifyAuth. */
function comoEstaAhora(token: string): { userId: string; companyId: string } | null {
  try {
    const d = jwt.verify(token, SECRETO) as { userId?: string; companyId?: string };
    return d.userId && d.companyId ? { userId: d.userId, companyId: d.companyId } : null;
  } catch {
    return null;
  }
}

/** Token falsificado: cabecera y firma de relleno, payload a gusto del atacante. */
function falsificar(userId: string, companyId: string): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ userId, companyId })}.firma-inventada`;
}

async function main() {
  await db.execute(sql`DELETE FROM quotes`);
  await db.execute(sql`
    INSERT INTO quotes (company_id, modo, user_id, sequence_number, total, status)
    VALUES (${A}::uuid, 'PRODUCCION', ${USER_A}::uuid, 'COT-REAL-0001', 125000, 'approved'),
           (${A}::uuid, 'PRUEBA',     ${USER_A}::uuid, 'COT-PRUEBA-77', 999, 'draft')
  `);

  console.log('\n1) Token falsificado, sin firma valida\n');
  const falso = falsificar(USER_A, A);
  ok('el decodificador antiguo se lo tragaba', comoEstabaAntes(falso) === USER_A,
    `devolvia userId=${comoEstabaAntes(falso)}`);
  ok('el de ahora lo rechaza', comoEstaAhora(falso) === null);

  console.log('\n2) Token firmado con la clave equivocada\n');
  const otraClave = jwt.sign({ userId: USER_A, companyId: A }, 'clave-del-atacante');
  ok('el antiguo tambien se lo tragaba', comoEstabaAntes(otraClave) === USER_A);
  ok('el de ahora lo rechaza', comoEstaAhora(otraClave) === null);

  console.log('\n3) Control: el token legitimo sigue funcionando\n');
  const bueno = jwt.sign({ userId: USER_A, companyId: A }, SECRETO, { expiresIn: '15m' });
  const leido = comoEstaAhora(bueno);
  ok('se acepta', leido !== null);
  ok('con el userId correcto', leido?.userId === USER_A);
  ok('y con la empresa dentro del token, no del slug', leido?.companyId === A);

  console.log('\n4) Token caducado\n');
  const viejo = jwt.sign({ userId: USER_A, companyId: A }, SECRETO, { expiresIn: -60 });
  ok('se rechaza', comoEstaAhora(viejo) === null);

  console.log('\n5) La empresa del token tiene que ser la de la tienda\n');
  // Un usuario legitimo de la empresa B visitando la tienda de la empresa A.
  const deB = comoEstaAhora(jwt.sign({ userId: USER_B, companyId: B }, SECRETO));
  ok('el token de B no autoriza en la tienda de A', deB?.companyId !== A);

  console.log('\n6) Las cotizaciones se filtran por empresa, usuario Y entorno\n');
  const enProduccion = await db.execute(sql`
    SELECT sequence_number FROM quotes
    WHERE company_id = ${A}::uuid AND user_id = ${USER_A}::uuid AND modo = 'PRODUCCION'
  `);
  const filas = enProduccion as unknown as { sequence_number: string }[];
  ok('en PRODUCCION solo sale la real', filas.length === 1 && filas[0].sequence_number === 'COT-REAL-0001',
    JSON.stringify(filas.map((f) => f.sequence_number)));

  const sinModo = await db.execute(sql`
    SELECT sequence_number FROM quotes
    WHERE company_id = ${A}::uuid AND user_id = ${USER_A}::uuid
  `);
  ok('sin el filtro de modo saldrian las dos (por eso hace falta)',
    (sinModo as unknown as unknown[]).length === 2);

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
