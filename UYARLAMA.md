# Kendine uyarlama

Kod değiştirmeden yapılan her şey `config.json`'da. Önce `config.example.json`'ı `config.json` olarak kopyaladığından emin ol. Bot dosya değişince kendisi yeniden okur; durdurmana gerek yok. Kaydettiğin dosyada hata varsa bot son geçerli sürümle devam eder ve hatayı loga yazar.

Her değişiklikten sonra:

```bash
node src/kampanya.mjs dogrula
```

Bölümler:

1. Kampanya alanları
2. Kendi kampanyanı ekle
3. Kelimeyi ya da DM'yi değiştir
4. Tek gönderiye bağla
5. Komut satırı
6. Windows dışında çalıştırma ve diğer ayarlar
7. Kodu değiştirmek istersen

---

## 1. Kampanya alanları

```json
{
  "kelime": "REHBER",
  "esanlam": ["rehber"],
  "gonderi_id": null,
  "yorum_cevabi": null,
  "dm": ["1. mesaj", "2. mesaj"],
  "eslesme": "icerir",
  "aktif": false,
  "not": "kendine not, bot kullanmaz"
}
```

| Alan | Anlamı |
|---|---|
| `kelime` | Ana kelime. Büyük/küçük harf ve Türkçe karakter duyarsız (`LİMİT` = `LIMIT` = `lımıt`). |
| `esanlam` | Ek kelimeler (ör. `["KILAVUZ"]`). Eşleşme zaten duyarsız; büyük/küçük biçimleri ayrıca yazmak şart değil. |
| `gonderi_id` | `null` = tüm gönderilerde. Bir gönderi kimliği (`"1790…"`) ya da kimlik listesi (`["1790…", "1801…"]`) yazarsan yalnız oralarda çalışır (§4). |
| `yorum_cevabi` | Yoruma yazılacak herkese açık cevap: tek metin ya da **liste**. Listede her yoruma kimliğine göre sabit biri seçilir; aynı cümleyi yüzlerce kez yazmak spam gibi görünür. `null` ise `varsayilan.yorum_cevabi` kullanılır. En çok 300 karakter. |
| `dm` | DM mesajları listesi. Her biri en çok **1000 bayt** (Meta sınırı; Türkçe harf 2, emoji 4 bayt). 1'den fazlaysa çok mesajlı akış çalışır (KURULUM.md §10). |
| `eslesme` | `icerir` (varsayılan): kelime yorumun içinde tam kelime olarak geçerse. `tam`: yorum yalnız o kelimeden ibaretse. Günlük bir kelime seçtiysen ("hat", "dosya") `tam` yap ya da kampanyayı tek gönderiye bağla. |
| `aktif` | `true` olmadan çalışmaz. |
| `devam_daveti` | İsteğe bağlı; yoksa `varsayilan.devam_daveti`. `{kalan}` kalan mesaj sayısıyla değişir. Çok mesajlı DM'de ilk mesajın sonuna eklenir ve 1000 bayta dahildir. |
| `not` | Serbest not; bot okumaz. |

Genel ayarlar (dosyanın üstünde):

| Ayar | Ne |
|---|---|
| `varsayilan.yorum_cevabi` | Kampanyada `yorum_cevabi` yoksa kullanılan cevap. |
| `varsayilan.devam_daveti` | Çok mesajlı DM'de ilk mesajın sonuna eklenen davet. |
| `kacanlar` | Açılışta kaçan yorum taraması: `aktif`, `son_gonderi_sayisi` (varsayılan 10), `en_eski_saat` (72), `ilk_acilista_yalniz_isaretle` (true: ilk açılışta eski yorumlara DM atma). |
| `zamanlama` | `mesajlar_arasi_ms` (devam mesajları arası, 1500), `bekleyen_gecerlilik_saat` (kişi kaç saat içinde cevap yazarsa devam mesajları gider, 168 = 7 gün). |

Aynı gönderi kapsamında iki **aktif** kampanya aynı kelimeyi dinleyemez; `dogrula` bunu hata olarak gösterir.

---

## 2. Kendi kampanyanı ekle

**Elle:** `config.json`'da `kampanyalar` listesine örneklerden birini kopyala, `kelime`, `dm` ve istersen `yorum_cevabi`'nı değiştir. JSON'da metin içinde satır atlamak için `\n`, tırnak için `\"` yaz.

**Komut satırıyla** (JSON'a dokunmadan): DM metnini bir dosyaya yaz. Birden çok mesaj olacaksa mesajların arasına tek başına `— — —` satırı koy:

```text
Selam! İstediğin liste burada:
1. ...
2. ...
— — —
Son olarak şu linke de bak: ...
```

Sonra:

```bash
node src/kampanya.mjs ekle --kelime LISTE --dm-dosya dm.txt --yorum "Gönderdim, DM'ine bak || Liste DM'de || Attım, mesaj isteklerine de bak"
```

Komut her mesajın bayt sayısını yazar. Kampanya **kapalı** eklenir. KURU modda dene (KURULUM.md §8), sonra:

```bash
node src/kampanya.mjs ac --kelime LISTE
```

**Yapay zekâ asistanıyla:** "config.json'a şu kampanyayı ekle: kelime X, DM metni Y, yorum cevapları A / B / C, aktif:false. Sonra dogrula'yı çalıştır." Asistan `config.json`'ı düzenleyebilir; `.env`'i okumasına gerek yok.

---

## 3. Kelimeyi ya da DM'yi değiştir

- `config.json`'da ilgili kampanyanın `kelime` / `dm` alanını değiştir, kaydet. Bot kendisi yeniden okur.
- Komut satırıyla tamamen yeniden yazmak için `ekle`'ye `--uzerine-yaz` ekle.
- **Kelimeyi değiştirince** kayıtlar kelimeye göre tutulduğu için eski kelimeyle DM almış kişi yeni kelimeyle tekrar alabilir. İstemiyorsan kelimeyi değil yalnız metni değiştir.
- Videoda söylediğin kelimeyle `kelime` birebir aynı olsun; izleyici yanlış yazarsa diye sık hataları `esanlam`'a ekleyebilirsin.

---

## 4. Tek gönderiye bağla

Kampanyanın yalnız bir Reels'te çalışması için `gonderi_id`'ye o gönderinin **medya kimliğini** yaz (linkteki kısa kod değil; 17–18 haneli sayı).

Kimliği bulmanın iki yolu:

1. **Logdan (en kolayı):** kampanyayı geçici olarak `gonderi_id: null` ve `aktif: true` ile, bot **KURU** moddayken aç. O gönderiye kelimeyi kendin değil, başka bir hesaptan yaz. Logdaki satırda `(gönderi 1790…)` kısmı kimliktir. Sonra `gonderi_id`'ye yaz.
2. **API'den:** son gönderilerini kimlik ve linkiyle listele (jeton komut geçmişinde kalmasın diye sorulur):

   Windows PowerShell:

```powershell
$id = Read-Host "IG_USER_ID"
$j = Read-Host "Jeton"
curl.exe "https://graph.facebook.com/v26.0/$id/media?fields=id,permalink,caption&limit=10&access_token=$j"
```

   macOS / Linux:

```bash
read -p "IG_USER_ID: " id; read -s -p "Jeton: " j; echo; curl "https://graph.facebook.com/v26.0/$id/media?fields=id,permalink,caption&limit=10&access_token=$j"; unset j
```

   Çıktıdaki `permalink` gönderinin linki, `id` aradığın kimlik.

Birden çok gönderi için liste yaz: `"gonderi_id": ["1790…", "1801…"]`. Tekrar tüm gönderilerde çalışsın istersen `null`.

---

## 5. Komut satırı

```bash
node src/kampanya.mjs listele
```

Diğerleri:

| Komut | Ne yapar |
|---|---|
| `dogrula` | `config.json`'ı kontrol eder (bayt sınırı, boş alan, kelime çakışması) |
| `ekle --kelime X --dm-dosya metin.txt` | Kapalı kampanya ekler. Seçenekler: `--dm "metin"` (birden çok kez), `--ayrac "..."`, `--yorum "A \|\| B"`, `--gonderi KIMLIK`, `--eslesme tam`, `--esanlam "A,B"`, `--devam "..."`, `--aktif`, `--uzerine-yaz` |
| `ac --kelime X` / `kapat --kelime X` | Açar / kapatır |
| `sil --kelime X` | Kampanyayı siler (gönderim kayıtları `data/bot.sqlite`'ta kalır) |

`npm run kampanya -- listele` de aynı işi yapar.

---

## 6. Windows dışında çalıştırma ve diğer ayarlar

Bot ve bekçi düz Node; macOS ve Linux'ta da çalışması beklenir. **Bu sistemlerde denenmedi.** Farklar:

- **Otomatik başlatma:** `scripts/*.ps1` yalnız Windows. macOS'ta launchd, Linux'ta systemd kullan; ikisinde de çalıştırılacak komut bu klasörde `npm run bekci` (ya da `node --disable-warning=ExperimentalWarning src/bekci.mjs`). Bekçi çökerse yeniden başlatsın diye systemd'de `Restart=always`, launchd'de `KeepAlive` aç. pm2 kullanıyorsan `pm2 start src/bekci.mjs --name ig-dm-bot` ve `pm2 save` (pm2'nin açılışta başlatması Linux/macOS'ta destekleniyor).
- **ngrok yolu:** Homebrew ile kurduysan genelde PATH'te; değilse `.env`'de `NGROK_YOLU`.
- **Uyku:** macOS'ta Ayarlar → Pil/Enerji'de prize takılıyken uykuyu kapat ya da `caffeinate` kullan.
- **Durdurma:** `gorev-sil.ps1`'in yaptığını elle yap: `data/bekci.pid`'deki süreci ve alt süreçlerini kapat.

**Saat dilimi:** loglar ve günlük log dosyası adları İstanbul saatine göre. Başka bir saat dilimi için `src/log.mjs` ve `src/bekci.mjs`'teki `"Europe/Istanbul"` değerini değiştir (ör. `"Europe/Berlin"`).

**Port:** `.env`'de `PORT`. Bekçi ngrok'u aynı porta yönlendirir. Bot yalnız `127.0.0.1`'i dinler; dışarıdan erişim yalnız ngrok tüneliyle.

**ngrok yerine başka tünel:** Cloudflare Tunnel gibi bir araç kullanacaksan `.env`'de `NGROK_KAPALI=true` yap, tüneli kendin aç ve Meta'ya o adresin `/webhook` yolunu ver. Bu repoda denenmedi.

**Sunucuya taşımak:** bilgisayarını açık tutmak istemiyorsan aynı klasörü küçük bir sunucuya (VPS) koyabilirsin; o durumda ngrok yerine sunucunun kendi HTTPS adresini kullanırsın. Bu repoda denenmedi; `.env` ve `data/` klasörünü güvenli tut.

---

## 7. Kodu değiştirmek istersen

- Testler önce: `npm test`. Değişiklikten sonra yine `npm test`; yeni davranış için `test/` altına test ekle.
- Akışın kalbi `src/isleyici.mjs` (yorum → kampanya → DM → yorum cevabı). Eşleşme kuralları `src/eslesme.mjs`, ayar ve doğrulama `src/ayarlar.mjs`.
- Önce KURU (`DRY_RUN=true`) ve `npm run sahte` ile dene; gerçek hesaba ancak sonra aç.
- Yapay zekâ asistanıyla çalışıyorsan [AGENTS.md](AGENTS.md) ona kuralları zaten söyler (Claude Code onu CLAUDE.md üzerinden okur).
