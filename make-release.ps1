# make-release.ps1
# Build Tauri app and pack into a ZIP for distribution.
# Usage: powershell -ExecutionPolicy Bypass -File make-release.ps1

Set-Location "$PSScriptRoot\bratsy-tauri"

# ── 1. Clean cached artifacts to force frontend re-embed ─────────
Write-Host ""
Write-Host "==> Cleaning build cache..." -ForegroundColor Cyan
$buildDir = ".\src-tauri\target\release"
Get-ChildItem "$buildDir\build\bratsy-tauri-*"      -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force
Get-ChildItem "$buildDir\.fingerprint\bratsy-tauri-*" -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force
Remove-Item "$buildDir\bratsy-tauri.exe" -Force -ErrorAction SilentlyContinue

# ── 2. Build ─────────────────────────────────────────────────────
Write-Host "==> Building..." -ForegroundColor Cyan
& ".\node_modules\.bin\tauri.cmd" build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed." -ForegroundColor Red
    exit 1
}

# ── 3. Find installer ────────────────────────────────────────────
$bundleDir = ".\src-tauri\target\release\bundle\nsis"
$conf    = Get-Content ".\src-tauri\tauri.conf.json" | ConvertFrom-Json
$version = $conf.version
# Filter by version to avoid picking up old installers
$setupFile = Get-ChildItem $bundleDir -Filter "*${version}*-setup.exe" | Select-Object -First 1
if (-not $setupFile) {
    Write-Host "Installer for v$version not found in $bundleDir" -ForegroundColor Red
    exit 1
}
# Remove old installers to keep the folder clean
Get-ChildItem $bundleDir -Filter "*-setup.exe" | Where-Object { $_.Name -notlike "*${version}*" } | Remove-Item -Force

# ── 3. Assemble release folder ───────────────────────────────────
$releaseDir = "$PSScriptRoot\release"
$folderName = "Digital Factory v$version"
$outFolder  = "$releaseDir\$folderName"

if (Test-Path $releaseDir) { Remove-Item $releaseDir -Recurse -Force }
New-Item -ItemType Directory -Path $outFolder | Out-Null

Copy-Item $setupFile.FullName "$outFolder\setup.exe"

$readme = @"
Digital Factory v$version — Cifrovoj zavod
==========================================

Trebovanija:
  - Windows 10 / 11 (64-bit)
  - Tecnomatix Plant Simulation (ljubaja versija, ustanovlennaja v C:\Program Files\Siemens\)

Ustanovka:
  1. Zapustite setup.exe
  2. Pri neobhodimosti razreshite ustanovku WebView2 (skachaetsja avtomaticheski ~2 MB)
  3. Zapustite Digital Factory iz menju Pusk

Pervyj zapusk:
  - Fajl jarlyка Plant Simulation izvlekaetsja avtomaticheski
  - Esli Plant Simulation ustanovlen v nestandartnoe mesto — ukazhite put v Nastrojkah

Podderzhka: github.com/ney9992/Bratsy_DP
"@
[System.IO.File]::WriteAllText("$outFolder\README.txt", $readme, [System.Text.Encoding]::UTF8)

# ── 4. Pack into ZIP ─────────────────────────────────────────────
$zipName = "Digital_Factory_v${version}.zip"
$zipPath = "$releaseDir\$zipName"
Compress-Archive -Path $outFolder -DestinationPath $zipPath -Force

# ── 5. Source archive (git archive — excludes target/ node_modules/) ──
Set-Location $PSScriptRoot
$srcZip = "$releaseDir\Digital_Factory_v${version}_source.zip"
git archive HEAD --format=zip --output="$srcZip"

# ── 6. Summary ───────────────────────────────────────────────────
$sizeMB    = [math]::Round((Get-Item $zipPath).Length / 1MB, 1)
$srcSizeMB = if (Test-Path $srcZip) { [math]::Round((Get-Item $srcZip).Length / 1MB, 1) } else { "?" }

Write-Host ""
Write-Host "==> Installer: $zipPath ($sizeMB MB)" -ForegroundColor Green
Write-Host "==> Source:    $srcZip ($srcSizeMB MB)" -ForegroundColor Green
Write-Host ""
Write-Host "Archive contents:" -ForegroundColor Yellow
Write-Host "  $zipName"
Write-Host "    $folderName/"
Write-Host "      setup.exe"
Write-Host "      README.txt"
Write-Host ""
