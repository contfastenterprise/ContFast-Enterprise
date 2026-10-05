# Lote 287: los mutantes de los dos bancos del registro con empresa.
#
#   python scratch/mutantes_registro_con_empresa.py
#
# Cada mutante cambia UNA cosa (con asercion: si no aplica, lo dice -- un mutante
# que no cambia nada no mide el banco), corre los dos bancos y devuelve el fichero a
# como estaba con `git show HEAD:`. Muerto = algun banco sale con codigo distinto de 0
# Y CON alguna FALLA (un banco que no arranca no cuenta como muerto: lote 193).
# El de integracion necesita la base desechable levantada (scratch/bancos_db).
import os, re, subprocess, sys

RUTA = 'src/app/api/v1/auth/register/route.ts'
ADMIN = 'src/app/api/v1/admin/companies/route.ts'
ALTA = 'src/services/empresas/altaDeEmpresa.ts'
RNC = 'src/services/empresas/rncDeLaEmpresa.ts'
REG = 'src/services/auth/registroDeEmpresa.ts'
BUSCAR = 'src/app/api/v1/auth/register/rnc/[rnc]/route.ts'
PAGINA = 'src/app/auth/register/page.tsx'
FORM = 'src/app/auth/register/components/FormularioDeRegistro.tsx'
LOGIN = 'src/app/auth/login/page.tsx'

MUTANTES = [
    ('sin el freno F0-02', RUTA, 'if (rnc) {', 'if (false && rnc) {'),
    ('el freno mira el cuerpo validado (despues de validar)', RUTA,
     "const rnc = body && typeof body === 'object' ? (body as { rnc?: unknown }).rnc : undefined;",
     'const rnc = undefined as unknown;'),
    ('sin la consulta de RNC repetido en el registro', RUTA,
     'if (await rncYaTieneEmpresa(db, empresaPedida.rnc)) {', 'if (false && await rncYaTieneEmpresa(db, empresaPedida.rnc)) {'),
    ('sin el 409 del indice unico en el registro', RUTA, 'if (esRncRepetidoEnLaBase(e)) {', 'if (false && esRncRepetidoEnLaBase(e)) {'),
    ('el usuario no es administracion', RUTA, "allRoles.find((r) => r.name === 'administracion')", "allRoles.find((r) => r.name === 'sistemas')"),
    ('"ya registrado" compara con guiones', ALTA, "regexp_replace(${companies.rnc}, '[^0-9]', '', 'g') = ${rnc}", '${companies.rnc} = ${rnc}'),
    ('el alta no siembra los ajustes', ALTA, '  await tx.insert(companySettings).values({', '  if (false) await tx.insert(companySettings).values({'),
    ('el RNC se guarda como se escribio', REG, '  return { name: d.razonSocial.trim(), rnc, businessActivity', '  return { name: d.razonSocial.trim(), rnc: d.rncEmpresa.trim(), businessActivity'),
    ('la actividad vacia no es nula', REG, "businessActivity: d.actividad?.trim() || null", "businessActivity: d.actividad ?? null"),
    ('el choque no sigue la causa', RNC, '    e = o.cause;', '    e = null;'),
    ('la pantalla acepta cualquier RNC', REG, '.refine((t) => rncDeLaEmpresa(t) !== null, RNC_INVALIDO)', '.refine((t) => t.length > 0, RNC_INVALIDO)'),
    ('Buscar DGII nunca encuentra', BUSCAR, 'if (!r.success || !r.name) {', 'if (true) {'),
    ('Administracion sin la consulta de repetido', ADMIN, 'if (await rncYaTieneEmpresa(db, rnc)) {', 'if (false && await rncYaTieneEmpresa(db, rnc)) {'),
    ('Administracion guarda el RNC como se escribio', ADMIN, 'const rnc = rncDeLaEmpresa(result.data.rnc)!;', 'const rnc = result.data.rnc;'),
    ('la pantalla manda `rnc`', PAGINA, 'rncEmpresa: v.rncEmpresa,', 'rnc: v.rncEmpresa,'),
    ('el formulario sin Buscar DGII', FORM, 'junto={<BotonBuscarDgii onClick={alBuscarRnc} buscando={buscandoRnc} />}', 'junto={null}'),
    ('el acceso sin el enlace al registro', LOGIN, 'href="/auth/register"', 'href="/auth/login"'),
]

ENV = dict(os.environ, DATABASE_URL='postgres://postgres@127.0.0.1:55432/contfast_bancos', NODE_ENV='test')
TSX = ['node', 'node_modules/tsx/dist/cli.mjs']


def correr(args, env=None):
    r = subprocess.run(TSX + args, capture_output=True, text=True, encoding='utf-8', errors='replace', env=env)
    salida = r.stdout + r.stderr
    return r.returncode, salida.count(' FALLA') + salida.count(' ROTO')


def restaurar(p):
    datos = subprocess.run(['git', 'show', f'HEAD:{p}'], capture_output=True).stdout
    with open(p, 'wb') as f:
        f.write(datos.replace(b'\r\n', b'\n').replace(b'\n', b'\r\n'))


muertos = vivos = 0
for nombre, p, a, b in MUTANTES:
    s = open(p, encoding='utf-8', newline='').read()
    if s.count(a) != 1:
        print(f'  NO APLICA  {nombre} ({s.count(a)} apariciones)')
        vivos += 1
        continue
    open(p, 'w', encoding='utf-8', newline='').write(s.replace(a, b))
    try:
        c1, f1 = correr(['scratch/verificar_registro_con_empresa.ts'])
        #  Con la base RESEMBRADA antes de cada mutante: uno que deja una empresa de
        #  mas (p. ej. Administracion guardando el RNC con guiones) no puede
        #  contaminar al siguiente.
        r = subprocess.run(['powershell', '-ExecutionPolicy', 'Bypass', '-File', 'scratch\\bancos_db\\base_desechable.ps1',
                            '-Accion', 'correr', '-Bancos', 'verificar_registro_con_empresa_db.ts', '-SinReiniciar'],
                           capture_output=True, text=True, encoding='utf-8', errors='replace')
        c2 = r.returncode
        m = re.search(r'ROJO .*\(salida -?\d+, (\d+) FALLA\)', r.stdout)
        f2 = int(m.group(1)) if m else 0
    finally:
        restaurar(p)
    muere = (c1 != 0 and f1 > 0) or (c2 != 0 and f2 > 0)
    print(f"  {'MUERTO' if muere else 'VIVO  '}  {nombre}  (codigo: {c1}/{f1} FALLA, integracion: {c2}/{f2} FALLA)")
    muertos += muere
    vivos += not muere

print(f'\n{muertos} muertos, {vivos} vivos de {len(MUTANTES)}')
sys.exit(0 if vivos == 0 else 1)
