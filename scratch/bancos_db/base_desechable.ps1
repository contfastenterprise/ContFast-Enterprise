# Base desechable para los bancos de integracion (los de deuda_bancos.txt).
#
#   powershell -ExecutionPolicy Bypass -File scratch\bancos_db\base_desechable.ps1 -Accion correr
#
# Acciones:
#   arrancar   crea el cluster si no existe y lo arranca (127.0.0.1:55432)
#   reiniciar  borra y recrea la base: marca, migraciones de drizzle/ y semilla
#   correr     reinicia y corre los bancos (todos los de la lista, o -Bancos a,b)
#   parar      para el cluster
#
# El cluster vive FUERA del repositorio (%LOCALAPPDATA%\contfast_bancos), con
# autenticacion `trust` y escuchando solo en 127.0.0.1. Usa los binarios de
# PostgreSQL 18 ya instalados, pero NO su servicio (puerto 5432): es otro
# cluster, en otro puerto, que se puede borrar entero sin perder nada.
#
# Los bancos se corren con `precarga.mts` (el candado) precargado: si DATABASE_URL no es esta
# base, o la base no lleva la marca, el banco no llega a arrancar.

param(
  [ValidateSet('arrancar', 'reiniciar', 'correr', 'parar')][string]$Accion = 'correr',
  [string[]]$Bancos,
  # Sin recrear la base: solo resiembra. Para iterar sobre un banco.
  [switch]$SinReiniciar
)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))

$BIN = 'C:\Program Files\PostgreSQL\18\bin'
$RAIZ = Join-Path $env:LOCALAPPDATA 'contfast_bancos'
$DATOS = Join-Path $RAIZ 'pgdata'
$PUERTO = 55432
$BASE = 'contfast_bancos'
$MARCA = 'contfast: base DESECHABLE de los bancos de integracion'
$URL = "postgres://postgres@127.0.0.1:$PUERTO/$BASE"

function Psql([string]$base, [string[]]$resto) {
  $salida = & "$BIN\psql.exe" -h 127.0.0.1 -p $PUERTO -U postgres -d $base -q -v ON_ERROR_STOP=1 @resto 2>&1
  if ($LASTEXITCODE -ne 0) { $salida | Write-Host; throw "psql fallo: $($resto -join ' ')" }
  $salida
}

function Arrancar {
  if (-not (Test-Path -LiteralPath (Join-Path $DATOS 'PG_VERSION'))) {
    New-Item -ItemType Directory -Force $RAIZ | Out-Null
    # `timezone=UTC` NO es un detalle (lote 174): Supabase corre en UTC, asi que
    # `created_at` guarda UTC. Este cluster heredaba la zona de Windows
    # (America/La_Paz, UTC-4) y guardaba hora local, con lo que un banco que
    # convierta de UTC a hora de RD pasaba aqui y fallaba en produccion -- o al
    # reves. El entorno de pruebas se parece a produccion o no sirve.
    & "$BIN\initdb.exe" -D $DATOS -U postgres --auth=trust --encoding=UTF8 --locale=C `
      -c listen_addresses=127.0.0.1 -c port=$PUERTO -c timezone=UTC -c log_timezone=UTC | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'initdb fallo' }
  }
  # Tambien para un cluster que ya existiera antes del lote 174.
  if (Test-Path -LiteralPath (Join-Path $DATOS 'postgresql.conf')) {
    $conf = Get-Content -LiteralPath (Join-Path $DATOS 'postgresql.conf') -Raw
    if ($conf -notmatch "(?m)^timezone = 'UTC'") {
      Add-Content -LiteralPath (Join-Path $DATOS 'postgresql.conf') -Value "`ntimezone = 'UTC'`nlog_timezone = 'UTC'"
    }
  }
  & "$BIN\pg_isready.exe" -h 127.0.0.1 -p $PUERTO -q
  if ($LASTEXITCODE -eq 0) { return }
  # Start-Process con salida a fichero: `pg_ctl start` deja al servidor con las
  # tuberias heredadas y la consola se queda esperando para siempre.
  Start-Process -FilePath "$BIN\pg_ctl.exe" -ArgumentList @('-D', "`"$DATOS`"", '-l', "`"$RAIZ\pg.log`"", 'start') `
    -WindowStyle Hidden -RedirectStandardOutput "$RAIZ\pg_ctl.out" -RedirectStandardError "$RAIZ\pg_ctl.err"
  # Hasta 5 minutos: tras una parada brusca (el sistema lo mato por memoria el
  # 2026-09-19) la recuperacion tardo 140 s en esta maquina.
  for ($i = 0; $i -lt 600; $i++) {
    & "$BIN\pg_isready.exe" -h 127.0.0.1 -p $PUERTO -q
    if ($LASTEXITCODE -eq 0) { return }
    Start-Sleep -Milliseconds 500
  }
  throw "El cluster no arranco; ver $RAIZ\pg.log"
}

# Las dos mitades de la semilla: el catalogo comun en SQL (empieza vaciando
# todo, asi que sirve tambien para reponer) y lo que siembra la aplicacion al
# dar de alta una empresa (semilla_app.ts, con el candado precargado).
function Sembrar {
  Psql $BASE @('-f', (Join-Path $PSScriptRoot 'semilla.sql')) | Out-Null
  $anterior = $env:DATABASE_URL
  $env:DATABASE_URL = $URL
  $ErrorActionPreference = 'Continue'
  $salida = & npx tsx --import ./scratch/bancos_db/precarga.mts scratch/bancos_db/semilla_app.ts 2>&1
  $codigo = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  $env:DATABASE_URL = $anterior
  if ($codigo -ne 0) { $salida | Write-Host; throw 'semilla_app.ts fallo (ver arriba).' }
}

function Reiniciar {
  Arrancar
  Psql 'postgres' @('-c', "DROP DATABASE IF EXISTS $BASE WITH (FORCE)") | Out-Null
  Psql 'postgres' @('-c', "CREATE DATABASE $BASE") | Out-Null
  Psql 'postgres' @('-c', "COMMENT ON DATABASE $BASE IS '$MARCA'") | Out-Null
  foreach ($m in Get-ChildItem drizzle -Filter '*.sql' | Sort-Object Name) {
    Psql $BASE @('-f', $m.FullName) | Out-Null
  }
  # Las migraciones no bastan: ver complemento_esquema.sql. Y se mide que
  # despues del complemento no falte nada del esquema de Drizzle.
  Psql $BASE @('-f', (Join-Path $PSScriptRoot 'complemento_esquema.sql')) | Out-Null
  $env:DATABASE_URL = $URL
  $ErrorActionPreference = 'Continue'
  $deriva = & npx tsx scratch/bancos_db/deriva_esquema.ts 2>&1
  $codigoDeriva = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  $env:DATABASE_URL = $null
  if ($codigoDeriva -ne 0) { $deriva | Write-Host; throw 'La base migrada no tiene todo el esquema de Drizzle (ver arriba).' }
  Sembrar
  Write-Host "Base $BASE lista: marca, $((Get-ChildItem drizzle -Filter '*.sql').Count) migraciones, complemento, esquema completo y semilla."
}

function Correr {
  # Con -SinReiniciar la siembra la hace el bucle, antes de cada banco.
  if ($SinReiniciar) { Arrancar } else { Reiniciar }
  $lista = if ($Bancos) { @($Bancos | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ }) }
           else { @(Get-Content scratch\_to_delete\deuda_bancos.txt | Where-Object { $_ -match '\.ts$' }) }
  $env:DATABASE_URL = $URL
  $env:NODE_ENV = 'test'
  $verdes = @(); $rojos = @()
  foreach ($b in $lista) {
    # Cada banco con la base recien sembrada: varios dejan filas que otro no
    # espera (la limpieza solo vacia lo transaccional, no el catalogo).
    if ($lista.Count -gt 1 -or $SinReiniciar) { Sembrar }
    # Node escribe en stderr; con 'Stop' eso cortaria el bucle entero.
    $ErrorActionPreference = 'Continue'
    $salida = & npx tsx --import ./scratch/bancos_db/precarga.mts "scratch/$b" 2>&1
    $ErrorActionPreference = 'Stop'
    $codigo = $LASTEXITCODE
    $fallas = @($salida | Select-String -SimpleMatch ' FALLA').Count
    if ($codigo -eq 0) { $verdes += $b; Write-Host ("  VERDE  {0}" -f $b) -ForegroundColor Green }
    else {
      $rojos += $b
      Write-Host ("  ROJO   {0}  (salida {1}, {2} FALLA)" -f $b, $codigo, $fallas) -ForegroundColor Red
      if ($Bancos) { $salida | Select-Object -Last 40 | ForEach-Object { Write-Host "         $_" } }
    }
  }
  $env:DATABASE_URL = $null
  Write-Host "`n$($verdes.Count) verdes, $($rojos.Count) rojos de $($lista.Count)."
  if ($rojos.Count -gt 0) { exit 1 }
}

switch ($Accion) {
  'arrancar'  { Arrancar; Write-Host "Cluster arriba en 127.0.0.1:$PUERTO" }
  'reiniciar' { Reiniciar }
  'correr'    { Correr }
  'parar'     { & "$BIN\pg_ctl.exe" -D $DATOS stop -m fast }
}
