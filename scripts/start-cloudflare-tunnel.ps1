param(
  [string]$Port = "3000"
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$RuntimeDir = Join-Path $Root ".runtime"
$EnvFile = Join-Path $RuntimeDir "public-app-url.env"
$PidFile = Join-Path $RuntimeDir "cloudflared.pid"
$StdoutLog = Join-Path $RuntimeDir "cloudflared.out.log"
$StderrLog = Join-Path $RuntimeDir "cloudflared.err.log"

New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
Remove-Item $EnvFile -ErrorAction SilentlyContinue
Remove-Item $StdoutLog -ErrorAction SilentlyContinue
Remove-Item $StderrLog -ErrorAction SilentlyContinue

$Cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $Cloudflared) {
  Write-Host "[WARN] cloudflared was not found in PATH. Install cloudflared to auto-create a tunnel."
  exit 0
}

$Arguments = @("tunnel", "--url", "http://localhost:$Port")
$Process = Start-Process `
  -FilePath $Cloudflared.Source `
  -ArgumentList $Arguments `
  -RedirectStandardOutput $StdoutLog `
  -RedirectStandardError $StderrLog `
  -WindowStyle Minimized `
  -PassThru

Set-Content -Path $PidFile -Value $Process.Id

$TunnelUrl = $null
for ($Attempt = 0; $Attempt -lt 45; $Attempt++) {
  Start-Sleep -Seconds 1

  $LogText = ""
  if (Test-Path $StdoutLog) {
    $LogText += Get-Content -Path $StdoutLog -Raw
  }
  if (Test-Path $StderrLog) {
    $LogText += Get-Content -Path $StderrLog -Raw
  }

  $Match = [regex]::Match($LogText, "https://[a-zA-Z0-9-]+\.trycloudflare\.com")
  if ($Match.Success) {
    $TunnelUrl = $Match.Value
    break
  }

  if ($Process.HasExited) {
    Write-Host "[ERROR] cloudflared exited before creating a tunnel. Check $StderrLog"
    exit 1
  }
}

if (-not $TunnelUrl) {
  Write-Host "[WARN] Cloudflare tunnel started, but no public URL was detected yet. Check $StderrLog"
  exit 0
}

Set-Content -Path $EnvFile -Value "PUBLIC_APP_URL=$TunnelUrl"
Write-Host "[OK] Cloudflare tunnel: $TunnelUrl"
