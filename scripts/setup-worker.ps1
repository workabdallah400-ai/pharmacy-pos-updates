<#
.SYNOPSIS
  Sets up and deploys the permanent public report host (Cloudflare Worker + KV).

.DESCRIPTION
  1. Logs into Cloudflare (opens the browser — approve the request).
  2. Creates the KV namespace and writes its id into wrangler.toml.
  3. Deploys the Worker and prints the permanent public URL.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/setup-worker.ps1
#>
param(
  [switch]$SkipLogin,
  [switch]$SkipDeploy
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$worker = Join-Path $root 'worker'
$toml = Join-Path $worker 'wrangler.toml'

Write-Host ''
Write-Host '═══════════════════════════════════════════════════' -ForegroundColor Cyan
Write-Host '  Pharmacy POS — Permanent Public Reports (Cloudflare)' -ForegroundColor Cyan
Write-Host '═══════════════════════════════════════════════════' -ForegroundColor Cyan
Write-Host ''

Set-Location $worker

# wrangler prints warnings on stderr — PowerShell would treat that as a fatal
# error, so the native commands run with a relaxed error preference.
function Invoke-Native {
  param([string]$Command, [string[]]$Arguments)
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = & $Command @Arguments 2>&1 | Out-String
    return [pscustomobject]@{ Output = $output; Code = $LASTEXITCODE }
  } finally {
    $ErrorActionPreference = $previous
  }
}

if (-not $SkipLogin) {
  Write-Host '▶ الخطوة 1/3: تسجيل الدخول إلى Cloudflare' -ForegroundColor Yellow
  Write-Host '  هيفتح المتصفح — سجّل دخولك (أو اعمل حساب مجاني) ووافق على الطلب.' -ForegroundColor Gray
  $login = Invoke-Native 'npx' @('wrangler', 'login')
  Write-Host $login.Output
  if ($login.Code -ne 0) { throw 'wrangler login فشل — تأكد من الاتصال بالإنترنت' }
}

Write-Host ''
Write-Host '▶ الخطوة 2/3: إنشاء مساحة التخزين الدائمة (KV)' -ForegroundColor Yellow

$content = Get-Content $toml -Raw
if ($content -match 'id\s*=\s*"([a-f0-9]{20,})"') {
  Write-Host '  ✅ مساحة KV موجودة بالفعل — تخطّي الإنشاء.' -ForegroundColor Green
} else {
  $created = Invoke-Native 'npx' @('wrangler', 'kv', 'namespace', 'create', 'REPORTS')
  Write-Host $created.Output
  $match = [regex]::Match($created.Output, 'id\s*=\s*"([a-f0-9]{20,})"')
  if (-not $match.Success) {
    throw 'لم يتم العثور على معرّف مساحة KV في نتيجة wrangler — شغّل الأمر يدوياً: npx wrangler kv namespace create REPORTS'
  }
  $id = $match.Groups[1].Value
  $content = [regex]::Replace($content, 'id\s*=\s*"REPLACE_WITH_YOUR_KV_NAMESPACE_ID"', "id = `"$id`"")
  Set-Content -Path $toml -Value $content -Encoding UTF8
  Write-Host "  ✅ تم حفظ معرّف KV: $id" -ForegroundColor Green
}

if ($SkipDeploy) {
  Write-Host ''
  Write-Host '▶ تم التوقف قبل النشر (-SkipDeploy). شغّل: npx wrangler deploy' -ForegroundColor Yellow
  exit 0
}

Write-Host ''
Write-Host '▶ الخطوة 3/3: نشر الـ Worker' -ForegroundColor Yellow
$deploy = Invoke-Native 'npx' @('wrangler', 'deploy')
Write-Host $deploy.Output

$urlMatch = [regex]::Match($deploy, 'https://[a-z0-9\-]+\.workers\.dev')
if ($urlMatch.Success) {
  $url = $urlMatch.Value
  Write-Host ''
  Write-Host '═══════════════════════════════════════════════════' -ForegroundColor Green
  Write-Host "  ✅ الرابط الدائم:  $url" -ForegroundColor Green
  Write-Host '═══════════════════════════════════════════════════' -ForegroundColor Green
  Write-Host ''
  Write-Host '  الخطوة التالية داخل البرنامج:' -ForegroundColor White
  Write-Host '   الإعدادات ← المزامنة السحابية ← رابط سيرفر التقارير'
  Write-Host "   اكتب:  $url" -ForegroundColor White
  Write-Host '   ثم اضغط «اختبار الاتصال» ✅' -ForegroundColor White
} else {
  Write-Host ''
  Write-Host '⚠️  انشر بنجاح لكن لم يتم التعرف على الرابط من الخرج —' -ForegroundColor Yellow
  Write-Host '   افتح https://dash.cloudflare.com/workers للاطلاع على عنوان الـ Worker.' -ForegroundColor Yellow
}
