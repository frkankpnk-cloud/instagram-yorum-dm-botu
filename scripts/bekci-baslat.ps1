# Görev Zamanlayıcı bu dosyayı gizli PowerShell penceresiyle açar; bekçi de bot + ngrok'u açar.
# Elle denemek için: powershell -ExecutionPolicy Bypass -File scripts\bekci-baslat.ps1
$kok = Split-Path -Parent $PSScriptRoot
Set-Location $kok
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = "C:\Program Files\nodejs\node.exe" }
& $node --disable-warning=ExperimentalWarning "$kok\src\bekci.mjs"
exit $LASTEXITCODE
