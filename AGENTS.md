# Yapay zekâ asistanı için talimat

Bu dosya Claude Code, Codex, Cursor, Gemini CLI ya da başka bir yapay zekâ aracı için ortak talimattır. `CLAUDE.md` bu dosyayı içe aktarır; kural değişikliği yalnız burada yapılır.

## Bu repo ne

Instagram **yorum → DM botu**: biri Reels'ine belirlenen kelimeyi yorum olarak yazar ("REHBER" gibi), bot ona Meta'nın resmî Private Reply yoluyla DM gönderir ve yoruma herkese açık kısa bir cevap yazar. ManyChat'in "yorumla, DM'den al" işinin kendi bilgisayarında, ücretsiz çalışan alternatifi. Node.js, **npm paketi yok** (yerleşik `node:sqlite`, `fetch`, `crypto`); internete açılması ngrok tüneliyle.

Kullanıcı onu **kendi Instagram hesabına** kurmak ve kendine göre düzenlemek istiyor; büyük ihtimalle kod bilmiyor. Sen onu yönlendirirsin; hesap panellerindeki tıklamaları ve gizli değerleri o kendi eliyle yapar.

Dosyalar: `README.md` (genel bakış) · `KURULUM.md` (adım adım rehber, ekran adları; **ayrıntının tek kaynağı**) · `UYARLAMA.md` (kampanya, kelime, tek gönderi, diğer sistemler) · `SIK-SORULANLAR.md` · kod `src/`, testler `test/`, Windows betikleri `scripts/`. Bu dosya KURULUM.md'yi tekrar etmez; adımın ayrıntısı için hep ilgili bölümünü aç.

## Asla yapmayacakların (pazarlıksız)

1. **`.env` dosyasını açma, okuma, ekrana basma, içeriğini kopyalama, commit'e koyma.** İçinde Meta app secret ve erişim jetonu var. Bir değerin dolu olup olmadığını öğrenmek için kullanıcıya sor ya da botun açılış logundaki mod satırına bak (`KURULUM MODUNDA … eksik: …`, `MOD: KURU`, `MOD: CANLI`). `.env.example`'ı okuyabilirsin. `.env` henüz yoksa `.env.example`'ı `.env` adıyla kopyalayabilirsin (o anda içinde değer yok); ondan sonra dosyaya kullanıcı yazar.
2. **Sırları sohbete, loga, komut satırına yazma.** Kullanıcı jeton ya da secret'ı sohbete yapıştırırsa kullanma; uyar: değeri `.env`'e kendisi yazsın, jetonu Meta panelinden yenilesin (sohbette kalan jeton sızmış sayılır). Jeton gereken komutlarda değeri argüman olarak yazma; KURULUM.md §7 adım 5'teki gibi `Read-Host` / `read -s` ile kullanıcıya sordur ve **komutu kullanıcı çalıştırsın**.
3. **Kullanıcı adına hesap açma, giriş yapma, panelde ayar değiştirme.** Meta geliştirici paneli, Business portföyü, Instagram, ngrok: hepsinde kullanıcı tıklar. Tarayıcı aracın olsa bile bu hesaplara girme, form doldurma, "Generate token" gibi düğmelere basma.
4. **Gerçek jetonu ya da kişisel veriyi commit'e, GitHub'a, paylaşılan dosyaya koyma.** `.env`, `.env.*` (yalnız değersiz `.env.example` hariç), `config.json`, `data/`, `logs/`, `*.sqlite*` git'e girmez; kullanıcı kendi değişikliklerini yükleyecekse `git status`'u birlikte kontrol et. `.gitignore`'u gevşetme.
5. **`data/` ve `logs/` içeriğini toplu dökme, paylaşma.** `data/bot.sqlite` ve loglar gerçek kişilerin kullanıcı adlarını ve kimliklerini tutar. Gerekirse yalnız sorulan kaydı oku.
6. **Kullanıcının onayı olmadan hiçbir şey gönderme.** Gerçek hesaba DM, yorum ya da Graph API'ye yazma çağrısı (POST) yapma. `DRY_RUN=false` yapmak kullanıcının kararı ve eli; sen yapma, ona söyle.
7. **Sistem ayarı değiştirme.** Görev Zamanlayıcı kaydı (`scripts/gorev-kaydet.ps1`), uyku ayarı, güvenlik duvarı, PATH: komutu ver, kullanıcı çalıştırsın.
8. **Uydurma yok.** Meta'nın davranışından emin değilsen "doğrulanamadı" de (KURULUM.md §12). DM metnini, kelimeyi, linki kullanıcı verir ya da senin taslağını açıkça onaylar; rakam ya da sonuç uydurma.

## Kullanıcı "kur" derse

"kur", "kurulum", "kurmama yardım et", "install", "setup" ya da README'deki hazır metin: aşağıdaki aşamaları **sırayla** yürüt. Her aşamanın sonunda "Doğrulama" satırındaki kanıtı gör (log satırı, komut çıktısı ya da kullanıcının ekran görüntüsü); görmeden sonraki aşamaya geçme. Kullanıcı yarıda bırakıp sonra dönerse önce Aşama 0'daki kontrollerle nerede kaldığını bul.

Konuşma biçimi: Türkçe, sade. Her komutu tek tek, ne işe yaradığıyla ver. Teknik terimi ilk geçtiği yerde bir cümleyle açıkla (webhook, jeton, tünel). Meta panelinin menü adları değişebilir; ekrandaki ad dokümandakiyle tutmuyorsa bunu açıkça söyle ve kullanıcıdan ekran görüntüsü iste.

### Aşama 0 · Ortamı ve durumu öğren

Kendin çalıştırabileceğin, hiçbir şeyi değiştirmeyen kontroller:

- `node -v` → **22.13 veya üstü** olmalı (yerleşik `node:sqlite` için). Değilse https://nodejs.org adresinden LTS sürümünü kullanıcı kursun.
- İşletim sistemi. Windows dışındaysa otomatik başlatma için UYARLAMA.md §6.
- `ngrok version` → kurulu mu.
- `.env` ve `config.json` **var mı** (yalnız varlık; `.env`'in içine bakma). Varsa kullanıcı daha önce başlamış; bot açıksa `http://127.0.0.1:8787/saglik` cevabındaki `mod` alanı nerede kaldığını söyler.
- `npm test` → `fail 0`. Bu testler internet, `.env` ve `config.json` istemez; kodun bu makinede çalıştığını gösterir. (`npm install` gerekmez, paket yok.)

**Doğrulama:** Node sürümü uygun, `npm test` geçti.

### Aşama 1 · Hesap ön koşulları (kullanıcıya sor)

- Instagram hesabı **profesyonel** (İşletme ya da İçerik üreticisi) ve **herkese açık** mı? Gizli hesap yorum webhook'u almaz.
- Meta geliştirici hesabı var mı (https://developers.facebook.com, Facebook hesabıyla giriş)? Yoksa kullanıcı açar.
- **İşletme portföyü** (business portfolio): yeni uygulamalardaki "Unified login" kurulumu bunu ister; yoksa uygulama oluştururken ya da business.facebook.com'da ücretsiz açılır. **Facebook sayfası gerekmez** (KURULUM.md §4 tablo).
- Aynı kelime için ManyChat gibi başka bir otomasyon çalışıyorsa canlıya geçmeden kapatılmalı (yoruma tek Private Reply hakkı var; ikisi yarışır).
- Kampanyası ne: kelime, DM metni, tüm gönderilerde mi tek Reels'te mi. Henüz bilmiyorsa örnek kampanyayla devam et, Aşama 7'de yazarsınız.

**Doğrulama:** dört sorunun cevabı net.

### Aşama 2 · Dosyalar

- `.env` yoksa `.env.example` → `.env` kopyala. `config.json` yoksa `config.example.json` → `config.json` kopyala. Örnek kampanyalar `aktif: false` gelir.
- `node src/kampanya.mjs dogrula` çalıştır.

**Doğrulama:** `config.json geçerli`.

### Aşama 3 · ngrok (KURULUM.md §3)

- Kurulum komutunu ver (Windows: `winget install ngrok.ngrok` ve ardından **mutlaka** `ngrok update`; eski sürüm `ERR_NGROK_121` ile kapanır). Kullanıcının onayıyla sen de çalıştırabilirsin.
- Hesap açmak, **authtoken** komutunu çalıştırmak ve panelin **Domains** sayfasından ücretsiz sabit adresi okumak kullanıcının işi.

**Doğrulama:** kullanıcı sabit adresini biliyor (`https://…ngrok-free.app`); `ngrok version` güncel.

### Aşama 4 · Botu kurulum modunda aç (KURULUM.md §5, §7 adım 1–2)

- Kullanıcı `.env`'e yalnız `WEBHOOK_VERIFY_TOKEN` (kendi uydurduğu uzun rastgele kelime) ve `NGROK_URL` yazar. Rastgele kelime için kullanıcıya şu komutu kendi terminalinde çalıştırmasını önerebilirsin: `node -e "console.log('dogrula-'+require('crypto').randomBytes(9).toString('hex'))"`.
- `npm run bekci` (ilk kurulumda görünür bir terminalde; kullanıcı açar ya da sen arka planda açıp çıktısını okursun).

**Doğrulama:** konsolda `KURULUM MODUNDA başladı (eksik: …)` ve `Webhook dinleniyor … dış adres https://…/webhook`; tarayıcıda `https://<adres>/saglik` → `"mod":"kurulum"`.

### Aşama 5 · Meta uygulaması ve webhook (KURULUM.md §4 adım 0–4, §7 adım 3–4)

Hepsi kullanıcının elinde; sen sırayla, ekranda ne göreceğiyle anlat:

1. Uygulama oluştur (kullanım durumu: Instagram mesaj ve içerik yönetimi), portföy seç.
2. **Webhook:** Callback URL `https://<adres>/webhook`, Verify token `.env`'deki ile birebir aynı → **Verify and save**. Sonra **comments** ve **messages** alanlarına **Subscribe**.
3. **App roles → Instagram Tester** → kendi kullanıcı adı; daveti instagram.com → Ayarlar → Uygulamalar ve web siteleri → Tester davetleri'nden kabul.
4. **Configuration:** Facebook Login for Business → Create configuration; System-user access token, Expiration **Never**, Business assets'te kendi Instagram hesabı, izinler yalnız `instagram_basic`, `instagram_manage_comments`, `instagram_manage_messages`.
5. **App secret** (App settings → Basic) ve **Generate access tokens** ile jeton. Jeton bir kez gösterilir; kullanıcı doğrudan `.env`'e yapıştırır. Hesap kimliğini (17 haneli, `1784…`) de not eder.

**Doğrulama:** bot logunda `Webhook doğrulama isteği kabul edildi`; kullanıcı secret, jeton ve kimliği aldığını söylüyor (değerleri sana söylemeden).

### Aşama 6 · KURU moda geç (KURULUM.md §5, §7 adım 5, §4 adım 7)

- Kullanıcı `.env`'e `META_APP_SECRET`, `IG_ACCESS_TOKEN`, `IG_USER_ID` yazar; `API_TURU=unified`, `DRY_RUN=true` kalır. Bekçi `.env` değişince botu kendisi yeniden başlatır.
- **Hesap aboneliği:** `subscribed_apps` çağrısını kullanıcı, KURULUM.md §7 adım 5'teki jetonu soran komutla kendi terminalinde çalıştırır. Beklenen `{"success": true}`.
- Instagram uygulamasında mesaj erişimi ayarını kullanıcı açar (§4 adım 7).

**Doğrulama:** logda `MOD: KURU`, `hesap @<kullanıcının-adı> (1784…)`, `Jeton: sistem kullanıcısı jetonu (süresiz)`; `/saglik` → `"mod":"kuru"`.

### Aşama 7 · Kampanya (UYARLAMA.md)

- Kullanıcının kelimesi ve metniyle kampanyayı `aktif: false` ekle (elle `config.json`'a ya da `node src/kampanya.mjs ekle …`). Örnek kampanyaları kullanıcı istemiyorsa sil.
- Tek Reels'e bağlanacaksa medya kimliğini UYARLAMA.md §4'teki yollardan biriyle bul; tahmin etme.
- `node src/kampanya.mjs dogrula` → DM başına 1000 bayt (Türkçe harf 2, emoji 4), boş alan, kelime çakışması.
- Metni kullanıcıya göster, onay al, sonra `node src/kampanya.mjs ac --kelime <KELİME>`.

**Doğrulama:** `dogrula` geçerli; `listele` kampanyayı açık gösteriyor.

### Aşama 8 · Test (KURULUM.md §8 adım 1–4; hepsi KURU)

1. `npm test` → `fail 0`.
2. Bot açıkken: `npm run sahte -- --metin "<KELİME> lütfen"` → logda `KURU @deneme_kisi … GÖNDERİLMEDİ (DRY_RUN)`. `npm run sahte -- --imza bozuk` → `403`.
3. Meta panelinde `comments` satırındaki **Test** düğmesi (kullanıcı basar).
4. Başka bir hesaptan gerçek yorum: önce Tester rolü olan, sonra rolü olmayan hesap. Rolü olmayan hesabın yorumu gelmiyorsa KURULUM.md §4 "Geliştirme modu yeterli mi?" (Live mod, gerekirse App Review; başvuruyu kullanıcı yapar).

**Doğrulama:** gerçek yorumda logda KURU satırı, hiçbir DM gitmemiş.

### Aşama 9 · Canlıya geçiş (kullanıcının kararı)

- Kullanıcıya söyle: başka otomasyon aracı kapalı mı, metin son hâli mi. Karar onunsa `.env`'de `DRY_RUN=false` yazar.
- Test hesabından tekrar yorum: DM o hesabın mesaj isteklerine düşmeli, yorumda herkese açık cevap görünmeli; aynı hesaptan ikinci yorumda "zaten gönderilmiş; atlandı".

**Doğrulama:** logda `MOD: CANLI` ve `DM gönderildi + yorum cevabı yazıldı`.

### Aşama 10 · 7/24 (KURULUM.md §9)

Windows'ta `scripts/gorev-kaydet.ps1` komutunu ve uyku ayarını kullanıcı çalıştırır/değiştirir. macOS/Linux için UYARLAMA.md §6 (denenmedi diye söyle).

**Doğrulama:** bilgisayar yeniden açıldıktan sonra `/saglik` cevap veriyor.

## İnsanın yapacağı adımlar (sen yapamazsın)

- ngrok hesabı, authtoken komutu, sabit adresi panelden okumak.
- Meta panelinde: uygulama ve işletme portföyü, Instagram Tester rolü ve daveti kabul, configuration, App secret'ı görmek, jeton almak, webhook'u doğrulamak ve alanlara abone olmak, gerekirse Live mod ve App Review başvurusu.
- Instagram uygulamasında mesaj erişimi ayarı.
- `.env`'e gizli değerleri yazmak, jetonlu `subscribed_apps` komutunu çalıştırmak, `DRY_RUN=false` yapmak.
- Otomatik başlatma betiği ve uyku ayarı.

## Sık hatalar

Tam tablo KURULUM.md §11; kısa sorular SIK-SORULANLAR.md.

| Belirti | İlk bakılacak |
|---|---|
| Meta "Verify and save" hata veriyor | Bot ve ngrok açık mı (`/saglik`)? Verify token iki yerde birebir aynı mı? URL `/webhook` ile bitiyor mu? |
| Logda "İmzası geçersiz webhook reddedildi" | `META_APP_SECRET` yanlış ya da eksik kopyalanmış. |
| Bot "KURULUM MODUNDA" kalıyor | Satırdaki "eksik:" listesindeki değer `.env`'de yok. |
| "Instagram hesabı bulunamadı" / "hesap listesi boş" | `IG_USER_ID` boş. Doluyken hata sürerse configuration'da hesap Business assets olarak seçili değil. |
| "JETON GEÇERSİZ" (kod 190) | Jeton iptal ya da süresi dolmuş; kullanıcı yenisini alır. |
| Webhook hiç gelmiyor | Hesap herkese açık mı, `comments`/`messages` abone mi, `subscribed_apps` yapıldı mı? Yorum yapanın rolü yoksa geliştirme modu (KURULUM.md §4). |
| DM hatası kod 10 / 200 | İzin eksik (`instagram_manage_messages`), jeton yeniden alınmalı; Instagram mesaj erişimi ayarı. |
| DM gitmedi, yorum 7 günden eski | Meta'nın Private Reply süresi dolmuş; yapılacak bir şey yok. |
| DM "mesaj istekleri"ne düştü | Normal: kişi takip etmiyorsa Instagram öyle yapar. |
| ngrok `ERR_NGROK_121` | Eski ngrok sürümü: `ngrok update`. |
| "Port 8787 açılamadı" | Botun bir kopyası zaten açık. |
| İki DM / iki herkese açık cevap | Aynı kelimede ManyChat gibi ikinci bir araç açık. |

## Kodu değiştirirken

- **npm paketi ekleme.** Proje bilerek bağımlılıksız. Gerçekten gerekiyorsa önce kullanıcıya gerekçeyle sor.
- Değişiklikten önce ve sonra `npm test`. Yeni davranış için `test/` altına test ekle (`test/yardimci.mjs`'te sahte Graph istemcisi ve sahte webhook yardımcıları var).
- Akış `src/isleyici.mjs`'te: kendi yorumunu atla → kelime eşleşmesi → tekrar kontrolü → önce DM → DM başarılıysa yorum cevabı. **"DM gitmezse herkese açık 'gönderdim' cevabı yazılmaz"** kuralını bozma.
- Webhook imza doğrulamasını (`src/imza.mjs`, `src/sunucu.mjs`) kapatma ya da atlatma; Meta'ya hemen 200 dönme davranışını koru (iş kuyrukta yapılır).
- Sunucu yalnız `127.0.0.1`'i dinler; dış erişim tünelle. Bunu `0.0.0.0` yapma.
- Yorumlar Türkçe ve "neden" sorusunu cevaplıyor; bu üslubu koru.

## Komutlar

```bash
npm test
```

```bash
npm run bekci
```

```bash
npm run sahte -- --metin "KELİME"
```

```bash
node src/kampanya.mjs listele
```

```bash
node src/kampanya.mjs dogrula
```

`npm start` botu bekçisiz açar (ngrok'u açmaz). Durum: `http://127.0.0.1:8787/saglik`. Loglar `logs/bot-YYYY-AA-GG.log`.
