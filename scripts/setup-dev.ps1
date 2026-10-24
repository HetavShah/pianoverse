# Pianoverse - one-time developer setup for live development on Windows.
# Installs the Visual C++ build tools (Rust needs Microsoft's linker), Rust, and the app's Node packages.
$ErrorActionPreference = 'Stop'
function Step($t) { Write-Host "`n==> $t" -ForegroundColor Cyan }
function Have($c) { [bool](Get-Command $c -ErrorAction SilentlyContinue) }

Step 'Checking Node.js'
if (-not (Have node)) { Write-Host 'Node.js is missing. Install it from https://nodejs.org and run this again.' -ForegroundColor Red; exit 1 }
node --version

Step 'Checking Visual C++ build tools'
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$hasVC = $false
if (Test-Path $vswhere) {
  $p = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
  if ($p) { $hasVC = $true; Write-Host "Found: $p" }
}
if (-not $hasVC) {
  Write-Host 'Installing Visual Studio 2022 Build Tools with C++ (about 2-4 GB, takes a while)...'
  winget install --id Microsoft.VisualStudio.2022.BuildTools -e --accept-package-agreements --accept-source-agreements `
    --override '--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended'
}

Step 'Checking Rust'
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
if (-not (Have cargo)) {
  winget install --id Rustlang.Rustup -e --accept-package-agreements --accept-source-agreements
  $env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
}
rustup default stable-msvc
cargo --version

Step 'Installing app packages'
Set-Location (Split-Path $PSScriptRoot -Parent)
npm install

Write-Host "`nAll set. Double-click dev.cmd to start Pianoverse in live mode." -ForegroundColor Green
Write-Host 'The first start compiles the app shell and takes a few minutes; later starts are quick.'
