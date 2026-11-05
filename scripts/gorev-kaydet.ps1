# Bilgisayar açılınca bot + ngrok kendiliğinden başlasın diye Windows Görev Zamanlayıcı'ya görev kaydeder.
# Bunu sen çalıştırırsın (sistem ayarı değiştirdiği için yapay zekâ asistanına çalıştırtma). KURULUM.md §9.
#
#   Varsayılan (yönetici gerekmez): Windows'a giriş yapınca başlar.
#     powershell -ExecutionPolicy Bypass -File scripts\gorev-kaydet.ps1
#
#   Giriş yapmadan, bilgisayar açılır açılmaz başlasın (PowerShell'i "Yönetici olarak" aç):
#     powershell -ExecutionPolicy Bypass -File scripts\gorev-kaydet.ps1 -AcilistaGirissiz
param([switch]$AcilistaGirissiz)

$ErrorActionPreference = "Stop"
$gorevAdi = "IG DM Bot"
$kok = Split-Path -Parent $PSScriptRoot
$baslatici = Join-Path $PSScriptRoot "bekci-baslat.ps1"
$kullanici = "$env:USERDOMAIN\$env:USERNAME"

$eylem = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$baslatici`"" `
  -WorkingDirectory $kok

# Pil, süre sınırı ve çökme durumunda dakikada bir yeniden deneme: 7/24 çalışsın diye.
$ayar = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew

if ($AcilistaGirissiz) {
  # S4U: şifre saklanmaz; kullanıcı giriş yapmasa da açılışta çalışır (yönetici yetkisi ister).
  $tetik = New-ScheduledTaskTrigger -AtStartup
  $kimlik = New-ScheduledTaskPrincipal -UserId $kullanici -LogonType S4U -RunLevel Limited
} else {
  $tetik = New-ScheduledTaskTrigger -AtLogOn -User $kullanici
  $kimlik = New-ScheduledTaskPrincipal -UserId $kullanici -LogonType Interactive -RunLevel Limited
}

Register-ScheduledTask -TaskName $gorevAdi -Action $eylem -Trigger $tetik -Settings $ayar -Principal $kimlik `
  -Description "Instagram yorum->DM otomasyonu: bekçi (bot + ngrok). Klasör: $kok" -Force | Out-Null
Start-ScheduledTask -TaskName $gorevAdi
Write-Host "Görev kaydedildi ve başlatıldı: '$gorevAdi'. Durum: Get-ScheduledTask -TaskName '$gorevAdi'"
Write-Host "Loglar: $kok\logs"
