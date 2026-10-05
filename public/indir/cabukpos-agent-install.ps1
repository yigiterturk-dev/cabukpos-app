param(
  [string]$BaseUrl = "https://cabukpos-app.vercel.app"
)

$ErrorActionPreference = "Stop"
$BaseUrl = $BaseUrl.TrimEnd("/")

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  throw "Node.js LTS bulunamadı. Önce https://nodejs.org adresinden LTS sürümünü kurun, sonra bu betiği yeniden çalıştırın."
}

$pairingCode = Read-Host "Yönetim > Donanım ekranındaki eşleme kodunu girin"
if ([string]::IsNullOrWhiteSpace($pairingCode)) {
  throw "Eşleme kodu boş bırakılamaz."
}

$installDir = Join-Path $env:ProgramData "CabukPOS"
$agentPath = Join-Path $installDir "cabukpos-agent.cjs"
New-Item -ItemType Directory -Force -Path $installDir | Out-Null

Write-Host "ÇabukPOS ajanı indiriliyor..."
Invoke-WebRequest -Uri "$BaseUrl/indir/cabukpos-agent.cjs" -OutFile $agentPath

Push-Location $installDir
try {
  Write-Host "Ajan eşleniyor..."
  & $node.Source $agentPath pair $pairingCode --url $BaseUrl
  if ($LASTEXITCODE -ne 0) { throw "Ajan eşlenemedi. Kodun süresi dolmuş veya daha önce kullanılmış olabilir." }

  Write-Host "Ajan Windows açılışına ekleniyor..."
  & $node.Source $agentPath install
  if ($LASTEXITCODE -ne 0) { throw "Ajan otomatik başlatmaya eklenemedi." }
} finally {
  Pop-Location
}

Write-Host "Kurulum tamamlandı. ÇabukPOS > Donanım ekranından yazıcıyı tanımlayıp deneme fişi basın." -ForegroundColor Green
