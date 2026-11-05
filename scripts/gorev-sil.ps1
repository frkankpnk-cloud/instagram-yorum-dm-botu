# Otomatik başlatmayı kaldırır ve çalışan bekçiyi (bot + ngrok) durdurur. Bunu sen çalıştırırsın.
#   powershell -ExecutionPolicy Bypass -File scripts\gorev-sil.ps1
$gorevAdi = "IG DM Bot"
$kok = Split-Path -Parent $PSScriptRoot
if (Get-ScheduledTask -TaskName $gorevAdi -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $gorevAdi -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $gorevAdi -Confirm:$false
  Write-Host "Görev kaldırıldı: $gorevAdi"
} else {
  Write-Host "Görev zaten yok: $gorevAdi"
}
# Görev durdurulunca bekçi alt süreçleri kalabilir; pid dosyasından bekçiyi ve çocuklarını kapat.
$pidDosyasi = Join-Path $kok "data\bekci.pid"
if (Test-Path $pidDosyasi) {
  $bekciPid = [int](Get-Content $pidDosyasi)
  taskkill /PID $bekciPid /T /F 2>$null | Out-Null
  Remove-Item $pidDosyasi -ErrorAction SilentlyContinue
  Write-Host "Bekçi (pid $bekciPid) ve alt süreçleri durduruldu"
}
