/**
 * Lote 287 -- el registro publico crea la empresa con SU nombre y SU RNC.
 *
 * Antes: `POST /api/v1/auth/register` metia siempre "Empresa Demo S.R.L.", RNC
 * 101001001 y "Servicios Generales", y la pantalla no los pedia. Decision del dueño
 * (2026-10-04): el registro sigue abierto, pero la empresa nace con sus datos.
 *
 * Lo que este banco EJECUTA: la regla del RNC (forma, normalizacion, el choque con
 * el indice unico) y el esquema del registro, y DIBUJA el formulario. Lo que lee:
 * el orden del freno F0-02 en la ruta, que las dos altas comparten el alta y la
 * regla de "ya registrado", y el enlace desde el acceso. El comportamiento contra
 * la base lo comprueba `verificar_registro_con_empresa_db.ts`.
 *
 *   npx tsx scratch/verificar_registro_con_empresa.ts
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');
/** Sin comentarios: una negacion no puede pasar porque el codigo EXPLIQUE lo que retiro. */
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
let total = 0;
const ok = (t: string, c: boolean, d = '') => { total++; console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const falta = (t: string, motivo: string) => ok(t, false, motivo);
/** Lo que lanza, falla: un mutante que hace reventar la regla no puede abortar el banco. */
const prueba = <T,>(f: () => T): T | 'LANZO' => { try { return f(); } catch { return 'LANZO'; } };

const RUTA = 'src/app/api/v1/auth/register/route.ts';
const ADMIN = 'src/app/api/v1/admin/companies/route.ts';
const ALTA = 'src/services/empresas/altaDeEmpresa.ts';
const BUSCAR = 'src/app/api/v1/auth/register/rnc/[rnc]/route.ts';
const PAGINA = 'src/app/auth/register/page.tsx';
const LOGIN = 'src/app/auth/login/page.tsx';

async function main() {
  //  Precondiciones: valen en los dos estados (las dos rutas y la pantalla existen
  //  antes y despues; el freno F0-02 estaba antes y tiene que seguir).
  for (const f of [RUTA, ADMIN, PAGINA, LOGIN]) if (!existsSync(join(raiz, f))) throw new Error(`Precondicion: falta ${f}`);
  if (!/code: 'REGISTRATION_CLOSED'/.test(leer(RUTA))) throw new Error('Precondicion: la ruta ya no tiene el freno F0-02');

  console.log('\n1) La regla del RNC y el esquema, ejecutados\n');
  let R: typeof import('../src/services/empresas/rncDeLaEmpresa') | null = null;
  let E: typeof import('../src/services/auth/registroDeEmpresa') | null = null;
  try { R = await import('../src/services/empresas/rncDeLaEmpresa'); } catch { R = null; }
  try { E = await import('../src/services/auth/registroDeEmpresa'); } catch { E = null; }

  const T1 = [
    'un RNC con guiones se acepta y se guarda solo con digitos',
    'una cedula de 11 digitos se acepta',
    'un RNC de 10 digitos se rechaza, con el motivo de la forma',
    'la razon social es obligatoria, y vacia se dice que falta',
    'la actividad es opcional: vacia se guarda como nula',
    'el esquema del registro NO tiene campo `rnc` (es el de "unirse", F0-02); el de la empresa es `rncEmpresa`',
    'la pantalla valida el RNC con la misma regla que el servidor',
    'la pantalla exige repetir la contraseña igual',
    'el choque con el indice unico de companies.rnc se reconoce aunque Drizzle lo envuelva',
    '  pero un 23505 de OTRO indice (el correo) no es un RNC repetido',
  ];
  if (!R || !E) {
    for (const t of T1) falta(t, 'no existen services/empresas/rncDeLaEmpresa.ts o services/auth/registroDeEmpresa.ts');
  } else {
    const base = { razonSocial: 'Ferreteria La Esquina S.R.L.', rncEmpresa: '101-00100-1', actividad: '', fullName: 'Juan Perez', email: 'juan@esquina.do', password: 'secreto123' };
    const p1 = E.esquemaDelRegistro.safeParse(base);
    const e1 = p1.success ? prueba(() => E!.empresaDelRegistro(p1.data)) : 'LANZO';
    ok(T1[0], e1 !== 'LANZO' && e1.rnc === '101001001' && e1.name === 'Ferreteria La Esquina S.R.L.', JSON.stringify(e1));

    const p2 = E.esquemaDelRegistro.safeParse({ ...base, rncEmpresa: '00112345678' });
    ok(T1[1], p2.success && prueba(() => E!.empresaDelRegistro(p2.data)) !== 'LANZO');

    const p3 = E.esquemaDelRegistro.safeParse({ ...base, rncEmpresa: '1010010010' });
    ok(T1[2], !p3.success && p3.error.issues.some((i) => i.path[0] === 'rncEmpresa' && i.message === R.RNC_INVALIDO),
      p3.success ? 'paso' : p3.error.issues.map((i) => i.message).join(' | '));

    const p4 = E.esquemaDelRegistro.safeParse({ ...base, razonSocial: '   ' });
    ok(T1[3], !p4.success && p4.error.issues.some((i) => i.path[0] === 'razonSocial' && /Escribe la razón social/.test(i.message)),
      p4.success ? 'paso' : p4.error.issues.map((i) => i.message).join(' | '));

    ok(T1[4], e1 !== 'LANZO' && e1.businessActivity === null, JSON.stringify(e1));

    const forma = Object.keys(E.esquemaDelRegistro.shape);
    ok(T1[5], forma.includes('rncEmpresa') && !forma.includes('rnc'), forma.join(','));

    const pantalla = (rnc: string) => E!.esquemaDelFormularioDeRegistro.safeParse({ ...base, rncEmpresa: rnc, confirmPassword: base.password });
    const casos = ['101001001', '101-00100-1', '00112345678', '1010010010', '12345', 'abc', ''];
    const discrepan = casos.filter((c) => pantalla(c).success !== E!.esquemaDelRegistro.safeParse({ ...base, rncEmpresa: c }).success);
    ok(T1[6], discrepan.length === 0 && !pantalla('1010010010').success && pantalla('101001001').success, `discrepan: ${discrepan.join(',')}`);

    const p8 = E.esquemaDelFormularioDeRegistro.safeParse({ ...base, confirmPassword: 'otra-cosa' });
    ok(T1[7], !p8.success && p8.error.issues.some((i) => i.path[0] === 'confirmPassword'));

    const envuelto = { message: 'Failed query: insert into "companies"', cause: { code: '23505', constraint_name: 'companies_rnc_idx' } };
    ok(T1[8], prueba(() => R!.esRncRepetidoEnLaBase(envuelto)) === true && prueba(() => R!.esRncRepetidoEnLaBase({ code: '23505', constraint_name: 'companies_rnc_idx' })) === true);
    ok(T1[9], prueba(() => R!.esRncRepetidoEnLaBase({ cause: { code: '23505', constraint_name: 'users_email_unique' } })) === false
      && prueba(() => R!.esRncRepetidoEnLaBase(new Error('otra cosa'))) === false
      && prueba(() => R!.esRncRepetidoEnLaBase({ cause: { code: '23503', constraint_name: 'companies_rnc_idx' } })) === false);
  }

  console.log('\n2) La ruta del registro\n');
  const ruta = leer(RUTA);
  const rutaCodigo = sinComentarios(ruta);
  ok('ya no quedan los datos fijos (Empresa Demo, 101001001, Servicios Generales)',
    !/Empresa Demo|'101001001'|Servicios Generales/.test(rutaCodigo) && /empresaDelRegistro\(parsed\.data\)/.test(rutaCodigo));
  ok('valida con el esquema compartido, que exige la empresa',
    /import \{[^}]*\besquemaDelRegistro\b[^}]*\} from '@\/services\/auth\/registroDeEmpresa'/.test(ruta) && /esquemaDelRegistro\.safeParse\(body\)/.test(rutaCodigo));
  //  F0-02: el freno mira el cuerpo CRUDO y va ANTES de validar, asi que una peticion
  //  con `rnc` se rechaza aunque el resto este mal o falte.
  const iFreno = rutaCodigo.search(/if \(rnc\) \{\s*return NextResponse\.json\(/);
  const iValida = rutaCodigo.indexOf('esquemaDelRegistro.safeParse(body)');
  ok('el freno F0-02 (`rnc` → 403) se mira en el cuerpo crudo, ANTES de validar',
    iFreno > 0 && iValida > 0 && iFreno < iValida && /\(body as \{ rnc\?: unknown \}\)\.rnc/.test(rutaCodigo),
    `freno ${iFreno}, validacion ${iValida}`);
  ok('un RNC con empresa se rechaza con 409, con la regla compartida',
    /from '@\/services\/empresas\/altaDeEmpresa'/.test(ruta) && /if \(await rncYaTieneEmpresa\(db, empresaPedida\.rnc\)\) \{\s*return NextResponse\.json\(\{ success: false, error: \{ code: 'RNC_YA_REGISTRADO', message: RNC_YA_REGISTRADO \} \}, \{ status: 409 \}\)/.test(rutaCodigo));
  ok('  y tambien si choca con el indice unico (dos registros a la vez)',
    /if \(esRncRepetidoEnLaBase\(e\)\) \{\s*return NextResponse\.json\([^)]*status: 409/.test(rutaCodigo));
  ok('empresa, usuario y auditoria van en UNA transaccion, con el alta de Administracion',
    /db\.transaction\(async \(tx\) => \{\s*const \{ empresa, roles: allRoles \} = await crearEmpresaConSuSiembra\(tx,/.test(rutaCodigo)
    && /await tx\s*\.insert\(users\)/.test(rutaCodigo) && /await tx\.insert\(auditLogs\)/.test(rutaCodigo)
    && !/await db\.insert\(companies\)/.test(rutaCodigo));
  ok('el primer usuario es administracion de SU empresa',
    /allRoles\.find\(\(r\) => r\.name === 'administracion'\)/.test(rutaCodigo) && /companyId,\s*roleId: adminRole\.id,/.test(rutaCodigo));

  console.log('\n3) Una sola alta, y una sola regla de "ya registrado"\n');
  const alta = leer(ALTA);
  const admin = sinComentarios(leer(ADMIN));
  ok('el alta compartida siembra lo que el registro no sembraba: ajustes de la empresa y nomina',
    /await tx\.insert\(companySettings\)\.values\(/.test(alta) && /await tx\.insert\(payrollConfigs\)\.values\(/.test(alta)
    && /await tx\.insert\(permissions\)/.test(alta));
  ok('  y lo de siempre: catalogo, tipos de gasto, periodos y permisos por rol, con la transaccion',
    ['seedDefaultChartOfAccounts(empresa.id, tx)', 'seedDefaultExpenseTypes(empresa.id, tx)', 'sembrarPeriodosContables(empresa.id, tx)',
      'seedRolePermissionsForCompany(tx, empresa.id, allRoles)'].every((s) => alta.includes(s)));
  ok('Administracion usa la MISMA alta (sin una copia propia)',
    /crearEmpresaConSuSiembra\(tx, \{/.test(admin) && !/tx\.insert\(companies\)/.test(admin) && !/tx\.insert\(companySettings\)/.test(admin));
  ok('  y la misma regla de RNC repetido, con 409',
    /if \(await rncYaTieneEmpresa\(db, rnc\)\) \{\s*return NextResponse\.json\([\s\S]{0,140}status: 409/.test(admin)
    && /if \(esRncRepetidoEnLaBase\(e\)\)/.test(admin));
  ok('  y la misma forma de RNC (9 u 11 digitos, sin guiones guardados)',
    /rnc: z\.string\(\)[^\n]*refine\(\(t\) => rncDeLaEmpresa\(t\) !== null, RNC_INVALIDO\)/.test(admin) && /const rnc = rncDeLaEmpresa\(result\.data\.rnc\)!/.test(admin));
  ok('"ya registrado" mira todas las empresas, comparando sin guiones',
    /regexp_replace\(\$\{companies\.rnc\}, '\[\^0-9\]', '', 'g'\) = \$\{rnc\}/.test(alta) && !/deletedAt|isNull/.test(alta));

  console.log('\n4) Buscar DGII sin sesion\n');
  const buscar = sinComentarios(leer(BUSCAR));
  ok('hay una consulta publica que reusa la del padron',
    /DGIIService\.lookupRNC\(buscado\)/.test(buscar) && /from '@\/services\/dgii\/rncLookup'/.test(buscar));
  ok('  limitada con el preset que cuenta sin Redis, y con su propia clave',
    /checkRateLimit\(`registro-rnc:\$\{ip\}`, 'auth'\)/.test(buscar));
  ok('  y que NO dice si ese RNC ya es cliente de ContFast',
    buscar.length > 0 && !/rncYaTieneEmpresa|companies/.test(buscar));

  console.log('\n5) El formulario, dibujado\n');
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  let html = '';
  let htmlAvisos = '';
  try {
    const { FormularioDeRegistro } = await import('../src/app/auth/register/components/FormularioDeRegistro');
    const { useForm } = await import('react-hook-form');
    const Arnes = (p: { conAvisos: boolean }) => {
      const form = useForm({ defaultValues: { rncEmpresa: '', razonSocial: '', actividad: '', fullName: '', email: '', password: '', confirmPassword: '' } });
      return React.createElement(FormularioDeRegistro as never, {
        form, alEnviar: () => {}, enviando: false, buscandoRnc: false, alBuscarRnc: () => {},
        avisoRnc: p.conAvisos ? { tipo: 'ok', texto: 'Encontrado en el padrón de la DGII.' } : null,
        motivoDelError: p.conAvisos ? RNC_YA : null,
      });
    };
    html = renderToStaticMarkup(React.createElement(Arnes, { conAvisos: false }));
    htmlAvisos = renderToStaticMarkup(React.createElement(Arnes, { conAvisos: true }));
  } catch (e) { html = ''; console.log(`   (no se pudo dibujar: ${(e as Error).message.slice(0, 120)})`); }

  const ids = ['rncEmpresa', 'razonSocial', 'actividad', 'fullName', 'email', 'password', 'confirmPassword'];
  const sinEtiqueta = ids.filter((id) => !new RegExp(`<label[^>]*for="${id}"`).test(html) || !new RegExp(`<input[^>]*id="${id}"`).test(html));
  ok('pide RNC, razon social y actividad, ademas de la cuenta, cada campo con su etiqueta',
    html.length > 0 && sinEtiqueta.length === 0, `sin etiqueta o sin campo: ${sinEtiqueta.join(',')}`);
  ok('"Buscar DGII" esta junto al RNC y no envia el formulario',
    /id="rncEmpresa"[\s\S]{0,700}<button[^>]*type="button"[^>]*>[\s\S]{0,400}Buscar DGII/.test(html));
  ok('sin `required` (tapaba los mensajes en español) y con la validacion nativa apagada',
    html.length > 0 && !/\srequired(=|\s|>)/.test(html) && /<form[^>]*novalidate/i.test(html));
  ok('el boton de crear es el dorado de la pantalla de acceso, sin ambar',
    /<button[^>]*type="submit"[^>]*class="[^"]*bg-\[#c5a059\]/.test(html) && !/amber-\d00/.test(html + leer(PAGINA)));
  ok('el rechazo sale dentro del formulario y se anuncia; lo del padron, como estado',
    /role="alert"[^>]*>[\s\S]{0,1200}Ya hay una empresa registrada/.test(htmlAvisos) && /role="status"[^>]*>[\s\S]{0,1200}Encontrado en el padr/.test(htmlAvisos)
    && !/role="alert"/.test(html));

  console.log('\n6) La pantalla manda la empresa, y el acceso lleva al registro\n');
  const pagina = sinComentarios(leer(PAGINA));
  ok('la pantalla manda `rncEmpresa` y `razonSocial`, nunca `rnc`',
    /rncEmpresa: v\.rncEmpresa,/.test(pagina) && /razonSocial: v\.razonSocial,/.test(pagina) && !/\brnc: /.test(pagina));
  ok('  valida con el esquema compartido', /resolver: zodResolver\(esquemaDelFormularioDeRegistro\)/.test(pagina));
  ok('  y "Buscar DGII" consulta la ruta publica y rellena la razon social',
    /fetch\(`\/api\/v1\/auth\/register\/rnc\/\$\{rnc\}`\)/.test(pagina) && /form\.setValue\('razonSocial', nombre/.test(pagina));
  const login = sinComentarios(leer(LOGIN));
  ok('el acceso ofrece "¿No tienes cuenta? Regístrate"',
    /¿No tienes cuenta\?[\s\S]{0,120}<Link\s+href="\/auth\/register"[\s\S]{0,300}>\s*Regístrate\s*<\/Link>/.test(login));

  console.log(`\n${fallos === 0 ? `TODO CORRECTO (${total} comprobaciones)` : `${fallos} FALLA(S) de ${total}`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

const RNC_YA = 'Ya hay una empresa registrada con ese RNC o cédula. Si trabajas en ella, pide a su administrador que te cree un usuario.';

main().catch((e) => { console.error(e); process.exit(2); });
