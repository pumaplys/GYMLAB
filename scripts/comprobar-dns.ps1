<#
.SYNOPSIS
  Comprueba los registros DNS del subdominio de envio antes de darle a "Verify"
  en Resend.

.DESCRIPTION
  Resend dice "no verificado" sin explicar cual de los registros falta, y el
  fallo mas comun no es que no haya propagado: es que el panel de Hostinger
  anade el dominio automaticamente al campo "Nombre", asi que un host pegado
  entero acaba como `resend._domainkey.envios.midominio.com.midominio.com`.
  Este script lo distingue.

  Se usa `Resolve-DnsName` y no `dig` porque `dig` NO viene con Windows —
  comprobado en el equipo desde el que se despliega.

.PARAMETER Dominio
  El dominio de envio completo. Ejemplo: envios.midominio.com

.EXAMPLE
  .\scripts\comprobar-dns.ps1 -Dominio envios.midominio.com
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$Dominio
)

$ErrorActionPreference = 'Continue'

function Consultar {
  param([string]$Nombre, [string]$Tipo)
  try {
    $r = Resolve-DnsName -Name $Nombre -Type $Tipo -ErrorAction Stop
    # Un TXT largo llega partido en trozos: hay que unirlos o parece truncado.
    switch ($Tipo) {
      'TXT' { return ($r | Where-Object { $_.Strings } | ForEach-Object { $_.Strings -join '' }) }
      'MX' { return ($r | Where-Object { $_.NameExchange } | ForEach-Object { $_.NameExchange }) }
      default { return $r }
    }
  } catch { return @() }
}

function Mostrar {
  param(
    [string]$Etiqueta,
    [string]$Nombre,
    [string]$Tipo,
    [string]$Pista,
    # Un nombre puede tener MUCHOS registros TXT: verificaciones de Google, de
    # Stripe, de lo que sea. Sin filtrar, cualquiera de ellos contaria como si
    # fuera el SPF y el control daria por bueno lo que no existe.
    [string]$Empieza
  )

  $valores = @(Consultar -Nombre $Nombre -Tipo $Tipo)
  if ($Empieza) { $valores = @($valores | Where-Object { $_ -like "$Empieza*" }) }
  if ($valores.Count -gt 0) {
    Write-Host ("  [OK]    {0}" -f $Etiqueta) -ForegroundColor Green
    foreach ($v in $valores) {
      $corto = if ($v.Length -gt 90) { $v.Substring(0, 90) + '...' } else { $v }
      Write-Host ("          {0}" -f $corto) -ForegroundColor DarkGray
    }
  } else {
    Write-Host ("  [FALTA] {0}" -f $Etiqueta) -ForegroundColor Yellow
    Write-Host ("          {0}  ({1})" -f $Nombre, $Tipo) -ForegroundColor DarkGray
    if ($Pista) { Write-Host ("          {0}" -f $Pista) -ForegroundColor DarkGray }
  }
  return $valores.Count -gt 0
}

Write-Host ''
Write-Host "Comprobando el envio desde $Dominio" -ForegroundColor Cyan
Write-Host ('-' * 60)

# El nombre exacto del DKIM lo decide Resend; `resend._domainkey` es el que usa
# hoy. Si Resend diera otro selector, este control avisara de que "falta" y hay
# que mirarlo a mano — que es mejor que dar por bueno lo que no se ha visto.
$dkim = Mostrar -Etiqueta 'DKIM  (firma los correos)' `
  -Nombre "resend._domainkey.$Dominio" -Tipo TXT `
  -Pista 'En Hostinger el Nombre va SIN tu dominio: resend._domainkey.envios'

$spf = Mostrar -Etiqueta 'SPF   (autoriza a Resend a enviar)' `
  -Nombre $Dominio -Tipo TXT -Empieza 'v=spf1' `
  -Pista 'Solo puede haber UN registro SPF por nombre'

$mx = Mostrar -Etiqueta 'MX    (recoge los rebotes)' `
  -Nombre $Dominio -Tipo MX `
  -Pista 'Lo da Resend junto al resto'

$dmarc = Mostrar -Etiqueta 'DMARC (que hacer con lo que no firme)' `
  -Nombre "_dmarc.$Dominio" -Tipo TXT -Empieza 'v=DMARC1' `
  -Pista 'Este lo decidimos nosotros: v=DMARC1; p=none; rua=mailto:...'

Write-Host ('-' * 60)

# La trampa de Hostinger, buscada explicitamente: si el registro aparece con el
# dominio repetido, el valor esta puesto pero en el sitio equivocado.
$raiz = ($Dominio -split '\.')[-2..-1] -join '.'
$duplicado = "resend._domainkey.$Dominio.$raiz"
if (@(Consultar -Nombre $duplicado -Tipo TXT).Count -gt 0) {
  Write-Host ''
  Write-Host '  ATENCION: el DKIM existe con el dominio REPETIDO.' -ForegroundColor Red
  Write-Host "  $duplicado" -ForegroundColor Red
  Write-Host '  Es la trampa del panel de Hostinger: quita tu dominio del campo Nombre.' -ForegroundColor Red
}

if ($dkim -and $spf -and $mx -and $dmarc) {
  Write-Host ''
  Write-Host '  Todo en su sitio. Ya se puede pulsar Verify en Resend.' -ForegroundColor Green
} else {
  Write-Host ''
  Write-Host '  Faltan registros. Si acabas de crearlos, el DNS puede tardar' -ForegroundColor Yellow
  Write-Host '  desde minutos hasta una hora en propagar.' -ForegroundColor Yellow
}
Write-Host ''
