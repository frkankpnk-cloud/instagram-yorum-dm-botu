# Kurulum rehberi

Bu dosya tek rehber. Menü adları ve Meta'nın davranışı **Kasım 2026**'ya göre yazıldı; Meta panelini sık değiştiriyor, ekranda küçük fark görürsen en yakın seçeneği seç. Emin olunamayan her şey metinde **doğrulanamadı** diye işaretli ve §12'de toplu duruyor.

**Kim ne yapar:** ngrok hesabı (§3), Meta paneli (§4, §7), Instagram ayarları ve `.env`'e gizli değerleri yazmak (§5) **senin elinle** yapılır; yapay zekâ aracın hiçbir hesaba girmez, yalnız nereye tıklayacağını söyler. Dosya hazırlama, test, kampanya yazma ve log okuma işini araca bırakabilirsin.

**Üç mod:**

- **KURULUM:** `.env`'de yalnız `WEBHOOK_VERIFY_TOKEN` (ve `NGROK_URL`) var. Meta'nın webhook doğrulaması geçer, gelen olaylar loglanır ama hiçbir şey yapılmaz.
- **KURU:** jeton ve secret da var, `DRY_RUN=true`. Eşleşmeler loga yazılır, **hiçbir DM ya da yorum gönderilmez.**
- **CANLI:** `DRY_RUN=false`. Bot gerçekten gönderir.

Bekçi altında (`npm run bekci`) bot `.env` değişince kendisi yeniden başlar. Durumu `https://<ngrok-adresin>/saglik` gösterir: `"mod":"kurulum" | "kuru" | "canli"`.

Bölümler:

1. Ne yapıyor, neden böyle kuruldu
2. Kontrol listesi
3. ngrok ve ücretsiz sabit adres
4. Meta uygulaması, izinler, jeton
5. `.env` doldurma
6. Kampanyalar
7. Webhook'u Meta'ya tanıtma
8. Test sırası
9. 7/24 çalıştırma
10. Private Replies kuralları ve çok mesajlı DM
11. Sorun giderme
12. Doğrulanamayanlar
13. Kaynaklar

---

## 1. Ne yapıyor, neden böyle kuruldu

Biri gönderine yorum yazar → Meta bota webhook atar → bot imzayı doğrular ve Meta'ya **hemen 200** döner → yorum arka plandaki kuyrukta işlenir:

1. Yorum **senin hesabından** mı? Öyleyse dokunmaz (döngü olmasın).
2. Yorum bir kampanyanın kelimesini içeriyor mu? (`LİMİT`, `limit`, `lımıt`, `Limit!!` aynı; `limitsiz` tetiklemez.)
3. Bu kişiye bu kampanya daha önce gitti mi? Gittiyse durur.
4. **Önce DM** (resmî Private Reply), **sonra** yoruma herkese açık cevap ("DM'den gönderdim, mesaj isteklerine bak"). DM gitmezse herkese açık cevap da yazılmaz; yoksa "gönderdim" yalan olur.
5. DM birden çok mesajsa ilk mesajın sonuna "devam için bir şey yaz" daveti eklenir; kişi cevap yazınca kalan mesajlar gider (§10).

Açılışta **kaçanları yakala**: son 10 gönderinin son 72 saatteki yorumları taranır, bot kapalıyken gelip işlenmemiş olanlar aynı akıştan geçer. **İlk açılışta** eski yorumlar DM'siz "görüldü" diye işaretlenir: başka bir araçla (ör. ManyChat) zaten cevapladığın kişilere ikinci DM gitmesin, eski yorumlara toplu DM atılmasın diye.

**Kararlar ve gerekçeleri**

| Karar | Neden |
|---|---|
| Instagram API with **Unified Login** (`graph.facebook.com`, v26.0), varsayılan | Yeni uygulamalarda Meta paneli başka seçenek sunmuyor ("API setup with Instagram login is not available for newer apps"). Facebook sayfası gerekmiyor; işletme portföyü gerekiyor. Eski "Instagram login" kurulumu `.env`'de `API_TURU=instagram` ile çalışır. |
| Süresiz sistem kullanıcısı jetonu, yenileme yok | Unified'da configuration'da "Expiration: Never" seçiliyor. Bot bu kurulumda yenileme denemez. Jeton geçersiz olursa (Meta hata kodu 190) logda "JETON GEÇERSİZ" yazar; yenisini alıp `.env`'e koyarsın. |
| npm paketi yok | Node'un kendi `http`, `crypto`, `fetch` ve yerleşik `node:sqlite` modülü yetiyor. Derleme yok, bağımlılık güncellemesi yok. **Node 22.13 ve üstü** gerekir. |
| pm2 değil, Görev Zamanlayıcı + kendi bekçimiz | pm2'nin "açılışta başlat" özelliği Windows'ta resmî olarak desteklenmiyor. Bekçi (`src/bekci.mjs`) botu ve ngrok'u açık tutar, çökerse yeniden başlatır. |
| Sıralı tek kuyruk | Aynı kişinin iki yorumu aynı anda gelince iki DM gitmesin. |
| Kayıtlar `data/bot.sqlite`'ta | Kime ne gittiği, bekleyen devam mesajları ve (eski kurulumda) yenilenen jeton burada. `data/` klasörü de `.env` kadar gizli: paylaşma, GitHub'a yükleme. |
| KURU / CANLI kayıtları ayrı | KURU denemede görülen yorum, canlıya geçince "zaten işlendi" sayılıp kaçmasın. |

**Dosya yapısı**

```
package.json          npm start / npm test / npm run bekci / kampanya / sahte
config.example.json   örnek kampanyalar → config.json olarak kopyalanır
.env.example          gizli ayarların şablonu → .env olarak kopyalanır
src/
  index.mjs           bot: ayarlar, jeton, sunucu, kaçanları yakala, periyodik işler
  sunucu.mjs          webhook: GET doğrulama, POST imza kontrolü, hemen 200, kuyruğa at
  isleyici.mjs        yorum → kampanya → DM → yorum cevabı; devam mesajları
  eslesme.mjs         Türkçe / büyük-küçük harf duyarsız kelime eşleşmesi
  imza.mjs            X-Hub-Signature-256 (HMAC-SHA256)
  api.mjs             Meta Graph istemcisi, yeniden deneme ve hız sınırı beklemesi
  jeton.mjs           jeton kaydı; eski Instagram login'de 60 günlük jetonun yenilenmesi
  kacanlar.mjs        açılışta kaçan yorumları tarama
  db.mjs              SQLite kayıtları (data/bot.sqlite)
  kuyruk.mjs          sıralı arka plan iş kuyruğu
  log.mjs             okunabilir log (logs/bot-YYYY-AA-GG.log), sırları maskeler
  bekci.mjs           bot + ngrok'u açık tutan bekçi
  kampanya.mjs        kampanya komut satırı
  sahte-webhook.mjs   yerel test için imzalı sahte webhook
scripts/
  gorev-kaydet.ps1    Windows açılışında otomatik başlatma
  gorev-sil.ps1       otomatik başlatmayı kaldırma
  bekci-baslat.ps1    Görev Zamanlayıcı'nın açtığı başlatıcı
  kontrol.mjs         node --check ile sözdizimi kontrolü
test/                 node --test testleri
data/  logs/          çalışınca oluşur (git'e girmez)
```

---

## 2. Kontrol listesi

Sıra önemli. Her adımın ayrıntısı ilgili bölümde.

- [ ] Node.js 22.13+ kurulu mu: `node -v`.
- [ ] Instagram hesabın **profesyonel** (İşletme ya da İçerik üreticisi) ve **herkese açık**.
- [ ] **ngrok** hesabı aç, kur, authtoken'ı ekle, ücretsiz sabit adresini not et (§3).
- [ ] `.env.example` → `.env`, `config.example.json` → `config.json` kopyala. Şimdilik `.env`'de yalnız `WEBHOOK_VERIFY_TOKEN` ve `NGROK_URL` doldur (§5). `npm run bekci` ile aç: bot **kurulum modunda** başlar.
- [ ] Meta'da uygulama ve işletme portföyü oluştur (§4 adım 0).
- [ ] Meta panelinde **webhook'u doğrula** (§7).
- [ ] Instagram hesabına **Instagram Tester** rolü ver, daveti kabul et; **configuration** oluştur; **Generate access tokens** ile jetonu al (§4 adım 1–4).
- [ ] `.env`'e `META_APP_SECRET`, `IG_ACCESS_TOKEN`, `IG_USER_ID` yaz → bot kendisi KURU moda geçer. **comments** ve **messages** alanlarına abone ol, `subscribed_apps` çağrısını yap (§7).
- [ ] Instagram'da mesaj erişimi ayarını aç (§4 adım 7).
- [ ] Test sırasını uygula: yerel test → sahte webhook → Meta "Test" düğmesi → ikinci hesapla gerçek yorum (KURU) (§8).
- [ ] Aynı kelime için **başka bir otomasyon aracı** (ManyChat vb.) çalışıyorsa kapat. İkisi aynı anda çalışırsa yoruma ilk DM'yi hangisi atarsa o kazanır, diğeri hata alır (yoruma tek Private Reply hakkı var) ve iki herkese açık cevap yazılabilir.
- [ ] Kampanya metinlerini kontrol et, `aktif: true` yap, sonra `.env`'de `DRY_RUN=false`.
- [ ] Uygulamada rolü olmayan bir hesaptan yorumla dene. Gelmiyorsa §4'teki "Geliştirme modu" bölümüne bak.
- [ ] Otomatik başlatmayı kur ve uyku modunu kapat (§9).

---

## 3. ngrok ve ücretsiz sabit adres

ngrok, bilgisayarındaki bota internetten HTTPS adres verir; modemde port açman gerekmez. Meta HTTPS istiyor, ngrok ücretsiz planda sertifikayı kendisi veriyor.

1. https://dashboard.ngrok.com/signup adresinden ücretsiz hesap aç.
2. ngrok'u kur:
   - Windows: `winget install ngrok.ngrok`, ardından **mutlaka** `ngrok update`. (Kasım 2026'da winget eski bir sürüm kuruyordu; ücretsiz hesap daha yeni sürüm istiyor, eski sürümde tünel `ERR_NGROK_121` ile hemen kapanıyor.)
   - macOS: `brew install ngrok` · Linux ya da elle: https://ngrok.com/download
   - PATH'te değilse `.env`'de `NGROK_YOLU=` satırına tam yolu yaz.
3. Panelde **Your Authtoken** sayfasındaki komutu çalıştır (authtoken'ı kimseyle paylaşma):

```bash
ngrok config add-authtoken BURAYA_SENIN_AUTHTOKENIN
```

4. **Sabit adres:** ücretsiz plan hesabına bir "dev domain" atar (ör. `ornek-isim.ngrok-free.app`); panelde **Domains** sayfasında görünür ve ngrok yeniden başlasa da değişmez. `.env`'de `NGROK_URL=https://ornek-isim.ngrok-free.app` yaz.
   - Bekçi ngrok'u `ngrok http 127.0.0.1:8787 --domain <adres>` ile açar. Hata alırsan `NGROK_URL`'yi boş bırak; ngrok atanmış adresi yine kullanır.
5. **Ücretsiz plan sınırları** (ngrok dokümanı, Kasım 2026): ayda **20.000 HTTP isteği**, **1 GB** veri, 1 dev domain. Meta her yorumu (kelime içermese bile) ve her DM olayını (botun kendi gönderdiği mesajların "yankısı" dahil) ayrı istek olarak yollar. Normal bir ay için bol; çok yorum alan viral bir videoda dolabilir. Sınır dolunca ne olduğu **doğrulanamadı**; panelin kullanım sayacına ayda bir bak.
6. Ücretsiz planın tarayıcıda gösterdiği uyarı sayfası, ngrok dokümanına göre programdan gelen isteklere (webhook) uygulanmıyor. §7'deki doğrulama geçiyorsa sorun yok demektir.

---

## 4. Meta uygulaması, izinler, jeton

**Ön koşul:** Instagram hesabın **profesyonel** ve **herkese açık** olmalı. Meta: gizli hesaplar yorum webhook'u almaz.

**Adım 0: uygulama ve portföy.** https://developers.facebook.com → **My Apps → Create App**. Kullanım durumu olarak Instagram mesaj ve içerik yönetimini seç (Kasım 2026'daki adı: "Manage messaging & content on Instagram"). Yeni uygulamalarda panel "API setup with Unified login" sunuyor; bu kurulum bir **işletme portföyü** (business portfolio) ister. Yoksa uygulama oluştururken ya da https://business.facebook.com üzerinden ücretsiz bir portföy aç. İşletme doğrulaması bu aşamada gerekmiyor.

Unified login'in botu ilgilendiren farkları:

| | Unified login (varsayılan) | Eski Instagram login |
|---|---|---|
| API adresi | `graph.facebook.com/v26.0` | `graph.instagram.com/v26.0` |
| Jeton | Sistem kullanıcısı jetonu (SUAT), "Expiration: Never" → süresiz, yenileme yok | 60 günlük, bot haftada bir yeniler |
| Hesap kimliği (`<IG_ID>`) | Meta'nın yolu `GET /me/assigned_instagram_accounts`. **Ama gerçek bir denemede sistem kullanıcısı jetonunda bu liste boş döndü**; `GET /<IG_ID>?fields=username` ise çalıştı. Bu yüzden `.env`'de **`IG_USER_ID` zorunlu**. | `GET /me?fields=user_id,username` |
| Private Reply | `POST /<IG_ID>/messages`, `recipient.comment_id`; izinler `instagram_basic`, `instagram_manage_comments`, `instagram_manage_messages` | aynı yol, `instagram_business_*` izinleri |
| Yorum cevabı / listeler | `POST /<YORUM_ID>/replies`, `GET /<IG_ID>/media`, `GET /<MEDYA_ID>/comments` | aynı |
| Webhook imzası | Meta app secret → `META_APP_SECRET` | Instagram app secret → `IG_APP_SECRET`; bot ikisini de dener |
| Facebook sayfası | Gerekmez | Gerekmez |

**Adımlar** (panelin "API setup with Unified login" sayfasındaki sırayla; webhook doğrulamasını §7'ye göre önce yapabilirsin, bot jeton olmadan da açılıyor):

1. **Instagram hesabını bağla, Tester rolü ver.**
   - **App roles → Roles → Add People → Instagram Tester** → Instagram kullanıcı adın.
   - Daveti kabul et: tarayıcıda instagram.com → Ayarlar → **Uygulamalar ve web siteleri → Tester davetleri** → Kabul et.
   - Meta'ya göre Tester'ın uygulamada rolü olmalı ve sen portföyde tam yetkili olmalısın; Instagram hesabı portföyde görünmüyorsa business.facebook.com → Ayarlar → Hesaplar → Instagram hesapları → Ekle. (Bu menü adı **doğrulanamadı**.)
2. **Configuration oluştur:** **Facebook Login for Business → Configurations → Create configuration**.
   - Login variation: **General**
   - Access token: **System-user access token (SUAT)**, Expiration: **Never**
   - Business assets: **Instagram account** → kendi hesabın
   - Permissions: botun ihtiyacı yalnız **`instagram_basic`, `instagram_manage_comments`, `instagram_manage_messages`**. Panelin önerdiği reklam ve yayın izinleri bot için gereksiz; kaldırılabiliyorsa kaldır (az izin = az risk).
   - Redirect / Login URL zorunluysa `https://<ngrok-adresin>/giris` yazabilirsin; bot bu adreste bir şey yapmaz. Bu alanların panel düğmesi yolunda kullanılıp kullanılmadığı **doğrulanamadı**.
   - Meta: configuration kaydedilince uygulama izinler için **Standard Access** alır; uygulamada rolü olan kişilerle test etmeye yeter.
3. **Meta app secret:** **App settings → Basic → App secret → Göster**. `.env`'de `META_APP_SECRET`'a yaz.
4. **Jetonu al:** Unified login sayfasında **Generate access tokens → Add account** → Instagram hesabınla giriş yap, izinleri onayla → çıkan jetonu kopyala. Jeton **yalnız bir kez gösterilir**; hemen `.env`'de `IG_ACCESS_TOKEN`'a yapıştır.
   - **`IG_USER_ID`'yi de doldur.** Kimliği Generate access tokens listesinde hesabının satırında görürsün; 17 haneli, genelde `1784…` ile başlar. (Panelin bu kısmı sık değişiyor; kimliğin tam olarak nerede göründüğü **doğrulanamadı**.) Kimliği yazdıktan sonra bot açılışta `GET /<IG_USER_ID>?fields=id,username` ile hesabı okur; logda kendi kullanıcı adını görüyorsan kimlik doğrudur.
   - Bot yeniden başlayınca logda `hesap @<kullanıcı-adın> (1784…) · API unified (https://graph.facebook.com)` ve `Jeton: sistem kullanıcısı jetonu (süresiz)` görünmeli. O sayı `<IG_ID>`; §7 adım 5'te lazım.
   - Panelden alınan bu jetonun da configuration'daki gibi süresiz olup olmadığı **doğrulanamadı**. Jeton bir gün geçersiz olursa logda "JETON GEÇERSİZ" yazar; aynı düğmeyle yenisini alırsın.
5. **Webhook'u tanıt:** §7. Alanlar: **comments** ve **messages**.
6. **Hesabı webhook'a abone et:** §7 adım 5.
7. **Mesaj erişimi:** telefonda Instagram → Ayarlar → **Mesajlar ve hikâye yanıtları → Mesaj kontrolleri → Bağlı araçlar → Mesajlara erişime izin ver** açık olmalı. Bu ayarın adı ve gerekliliği Meta dokümanından **doğrulanamadı**; kapalıysa DM gönderiminde izin hatası alabilirsin.

### Geliştirme modu yeterli mi?

Meta'nın dokümanları çelişkili:

- App Review sayfası: "uygulama yalnız sahibi olduğum ya da yönettiğim işletme için" → **Standard Access**, App Review **gerekmez**.
- Unified başlangıç sayfası: Standard Access "uygulamada rolü olan kişilerle test etmeye yeter"; başkaları için Advanced Access ve Live mod gerekir.
- Webhook kurulum sayfası: `comments` bildirimleri için Advanced Access gerekir ve uygulama Live olmalı.

Bu repoyu yazan kişinin hesabında (Kasım 2026) **geliştirme modunda, uygulamada rolü olmayan bir takipçinin yorumu webhook'la geldi.** Bu senin uygulamanda da öyle olacak demek değil. Önerilen yol, ücretsiz ve adım adım:

1. Geliştirme modunda kur ve test et (§8). Rolü olan ikinci bir hesaptan (Tester olarak eklenmiş) yorum yap.
2. Sonra rolü olmayan bir hesaptan yorum yap. Logda `HAM webhook` (`.env`'de `LOG_HAM=true`) ya da eşleşme satırı görürsen iş bitti.
3. Gelmiyorsa uygulamayı **Live** moda al (panelin üst çubuğundaki mod düğmesi). Meta bunun için gizlilik politikası adresi, 1024×1024 uygulama ikonu, kategori ve iletişim e-postası ister. Gizlilik politikası için herkese açık basit bir sayfa yeter. Başka şart (ör. veri silme adresi) isteyip istemediği **doğrulanamadı**.
4. Live modda da gelmiyorsa `instagram_manage_comments` ve `instagram_manage_messages` için **Advanced Access** başvurusu gerekir: App Review (izin başına ekran kaydı ve kullanım açıklaması) ve **Business Verification**. Ücretsiz ama günler-haftalar sürebilir. Başvuru metnini ve ekran kaydı senaryosunu yapay zekâ asistanına taslak olarak hazırlatabilirsin; gönderen sen olmalısın.

**Eski Instagram login kurulumu** (yalnız panel onu sunan eski bir uygulaman varsa): `.env`'de `API_TURU=instagram`, secret olarak Instagram app secret (`IG_APP_SECRET`), jeton "API setup with Instagram business login → Generate token" (60 gün, bot haftada bir yeniler), izinler `instagram_business_basic`, `instagram_business_manage_comments`, `instagram_business_manage_messages`.

---

## 5. `.env` doldurma

Klasörde `.env.example`'ı kopyala, adını `.env` yap, bir metin düzenleyiciyle aç ve doldur:

| Değişken | Ne yazacaksın |
|---|---|
| `WEBHOOK_VERIFY_TOKEN` | Kendin uydurduğun uzun rastgele bir kelime (ör. `dogrula-` + 12 rastgele harf/rakam). §7'de Meta paneline de aynısını yazacaksın. **İlk anda yalnız bu ve `NGROK_URL` yeter** (kurulum modu). |
| `META_APP_SECRET` | §4 adım 3. Webhook imzası bununla doğrulanır. Yoksa bot kurulum modunda kalır. |
| `IG_APP_SECRET` | Yalnız eski Instagram login kurulumunda. Unified'da boş. |
| `IG_ACCESS_TOKEN` | §4 adım 4'teki jeton. Yoksa bot kurulum modunda kalır. |
| `IG_USER_ID` | **Unified'da doldur.** Instagram hesap kimliğin (§4 adım 4). |
| `API_TURU` | `unified` (varsayılan). Eski kurulum için `instagram`. |
| `DRY_RUN` | Başta `true`. Testler bitince `false`. |
| `PORT` | `8787`. Başka bir program kullanıyorsa değiştir; ngrok da aynı porta yönlenir. |
| `NGROK_URL` | §3'teki sabit adres, `https://...ngrok-free.app`. |
| `NGROK_YOLU` | `ngrok` PATH'te değilse tam yolu. |
| `NGROK_KAPALI` | `true`: bekçi ngrok'u açmaz (ngrok'u ayrı bir hizmet olarak çalıştırıyorsan). |
| `LOG_HAM` | İlk kurulumda `true` (gelen webhook'un ham hali loga yazılır), çalıştığını görünce `false`. |

`.env` gizli: ekran kaydına girmesin, kimseyle paylaşma, GitHub'a yükleme (`.gitignore` dışarıda tutar). Yapay zekâ asistanına bu dosyayı okutma; değerleri sen yaz.

---

## 6. Kampanyalar

Her kampanya bir kelime ve ona bağlı metinler; `config.json`'da durur. Bot dosya değişince kendisi yeniden okur, durdurmaya gerek yok. Dosya bozuk kaydedilirse bot son geçerli sürümle devam eder ve loga hatayı yazar.

Kendi kampanyanı ekleme, kelime ve DM değiştirme, tek gönderiye bağlama, dönüşümlü yorum cevabı ve komut satırı: **[UYARLAMA.md](UYARLAMA.md)**.

Kısa komutlar:

```bash
node src/kampanya.mjs listele
```

```bash
node src/kampanya.mjs dogrula
```

```bash
node src/kampanya.mjs ac --kelime REHBER
```

---

## 7. Webhook'u Meta'ya tanıtma

Bu adımı jetondan önce yapabilirsin: `.env`'de yalnız `WEBHOOK_VERIFY_TOKEN` ve `NGROK_URL` varken bot **kurulum modunda** açılır ve Meta'nın doğrulamasını geçer.

1. Botu ve ngrok'u aç (ilk kurulumda görünür bir terminalde):

```bash
npm run bekci
```

   Konsolda `KURULUM MODUNDA başladı (eksik: …)` ya da `MOD: KURU` satırını ve `Webhook dinleniyor … dış adres https://…/webhook` satırını gör. ngrok çıktısı `logs/ngrok-YYYY-AA-GG.log`'a gider.

2. Tarayıcıda `https://<senin-adresin>.ngrok-free.app/saglik` aç: `{"ok":true,"mod":"kurulum",...}` görmelisin.
3. Meta panelinde **API setup with Unified login → Configure webhooks**:
   - **Callback URL:** `https://<senin-adresin>.ngrok-free.app/webhook`
   - **Verify token:** `.env`'deki `WEBHOOK_VERIFY_TOKEN` ile birebir aynı
   - **Verify and save**. Bot logunda "Webhook doğrulama isteği kabul edildi" çıkmalı.
4. Aynı yerde alan listesinde **comments** ve **messages** için **Subscribe**. Kurulum modunda gelen olaylar logda "işlenmedi" diye görünür; normal.
5. **Hesap aboneliği** (jeton aldıktan sonra): `POST https://graph.facebook.com/v26.0/<IG_ID>/subscribed_apps`. `<IG_ID>` logdaki `hesap @… (1784…)` sayısı. Jeton komut geçmişinde kalmasın diye önce sorulur.

   Windows PowerShell (`curl.exe` yaz; PowerShell'deki `curl` başka bir komut):

```powershell
$id = Read-Host "IG_ID (logdaki 1784... sayisi)"
$j = Read-Host "Jetonu yapistir"
curl.exe -X POST "https://graph.facebook.com/v26.0/$id/subscribed_apps" -d "subscribed_fields=comments,messages" -d "access_token=$j"
```

   macOS / Linux:

```bash
read -p "IG_ID: " id; read -s -p "Jeton: " j; echo; curl -X POST "https://graph.facebook.com/v26.0/$id/subscribed_apps" -d "subscribed_fields=comments,messages" -d "access_token=$j"; unset j
```

   Cevap `{"success": true}` olmalı. (Eski Instagram login kurulumunda adres `https://graph.instagram.com/v26.0/me/subscribed_apps`.)

6. `NGROK_URL` ya da `PORT`'u değiştirirsen bekçiyi kapatıp yeniden aç; bot `.env` değişince kendisi yeniden başlar ama ngrok tünelini bekçi açılışta kurar.

---

## 8. Test sırası

Her adım geçmeden bir sonrakine geçme. Hepsinde `DRY_RUN=true`.

1. **Yerel testler** (internet gerekmez, `.env` ve `config.json` gerekmez):

```bash
npm test
```

   Beklenen: `node --check` satırında bütün dosyalar temiz, sonunda `fail 0`. Testler: Türkçe eşleşme, imza doğrulama, kurulum modu, Unified hesap bulma, sahte webhook'la uçtan uca KURU ve CANLI akış (sahte API ile), tekrar engeli, kendi yorumunu yok sayma, çok mesajlı DM, DM hatasında herkese açık cevabın yazılmaması, config'in canlı düzenlenmesi, kaçanları yakala, jeton yenileme, yeniden deneme.

2. **Çalışan bota sahte webhook** (Meta'ya hiçbir şey gitmez; `.env`'deki secret ile imzalanır). Kampanya `aktif: true` olmalı; deneme için `ac` ile açıp sonra `kapat` ile kapatabilirsin. Bot açıkken ikinci bir terminalde:

```bash
npm run sahte -- --metin "REHBER lütfen"
```

   Bot logunda `KURU @deneme_kisi "REHBER lütfen" → REHBER … GÖNDERİLMEDİ (DRY_RUN)` görmelisin. Bozuk imza denemesi `npm run sahte -- --imza bozuk` → `403`.

3. **Meta'nın Test düğmesi:** webhook ayarlarında `comments` satırındaki **Test**. Logda ham gövde (`LOG_HAM=true`) ya da işlem satırı görünmeli.
4. **Gerçek yorum, KURU:** başka bir hesaptan (önce Tester rolü olan, sonra rolü olmayan) gönderine kelimeyi yaz. Logda KURU satırı çıkmalı; hiçbir DM gitmemeli.
5. **Canlıya geçiş:** metni kontrol et → `node src/kampanya.mjs ac --kelime REHBER` → `.env`'de `DRY_RUN=false` → bekçi altında bot birkaç saniyede kendisi yeniden başlar. Logda `MOD: CANLI` görmelisin. İlk canlı açılışta eski yorumlar DM'siz işaretlenir.
6. **Gerçek DM testi:** test hesabından tekrar yaz. DM o hesabın **mesaj istekleri** klasörüne düşmeli (takip etmiyorsa), yorumda herkese açık cevap görünmeli. Aynı hesaptan ikinci kez yazınca logda "zaten gönderilmiş; atlandı" çıkmalı.

---

## 9. 7/24 çalıştırma

**Windows** (Görev Zamanlayıcı; yönetici yetkisi istemez):

1. PowerShell'i bu klasörde aç ve çalıştır:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\gorev-kaydet.ps1
```

   Bu, **Windows'a giriş yapınca** gizli pencerede bekçiyi açan "IG DM Bot" görevini kaydeder ve hemen başlatır.
   - Bilgisayar açılır açılmaz, **giriş yapmadan** başlasın istersen PowerShell'i **Yönetici olarak** aç ve sonuna ` -AcilistaGirissiz` ekle (şifre saklanmaz, S4U oturumu).
   - Önce elle açtığın bekçiyi kapat; iki bekçi olursa ikincisi kendini kapatır ama karışıklık çıkmasın.
2. Kaldırmak için:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\gorev-sil.ps1
```

   Not: Görev Zamanlayıcı'dan görevi durdurmak bekçinin açtığı bot ve ngrok süreçlerini her zaman kapatmıyor; `gorev-sil.ps1` bunları da kapatır.
3. **Uyku modunu kapat** (bilgisayar uyursa bot da uyur): Ayarlar → Sistem → Güç → "Prize takılıyken uyku: Hiçbir zaman". Ekranın kapanması sorun değil.
4. Windows Update yeniden başlatırsa görev girişte (ya da `-AcilistaGirissiz` ile açılışta) kendiliğinden döner; açılıştaki kaçanları yakala adımı aradaki yorumları işler.

**macOS / Linux:** betikler yalnız Windows için. `npm run bekci`'yi launchd, systemd ya da pm2 ile başlatabilirsin; örnek ve notlar [UYARLAMA.md](UYARLAMA.md) §6'da.

**Durum kontrolü:** `logs/bot-YYYY-AA-GG.log` (bot), `logs/ngrok-…log` (tünel), `https://<adresin>/saglik`.

---

## 10. Private Replies kuralları ve çok mesajlı DM

Meta'nın Private Replies dokümanından (Kasım 2026, v26.0):

| Kural | Durum |
|---|---|
| Uç nokta: `POST graph.facebook.com/v26.0/<IG_ID>/messages`, `recipient: {comment_id}`, `message: {text}` | Doğrulandı (Unified) |
| **Yorum başına tek mesaj** | Doğrulandı |
| Yorumdan sonra **7 gün** içinde gönderilmeli | Doğrulandı. Bot 7 günden eski yorumu "süresi geçti" diye atlar. |
| Canlı yayın yorumlarına yalnız yayın sürerken | Doğrulandı (bot canlı yayın yorumlarını dinlemiyor) |
| Takip ediyorsa gelen kutusuna, etmiyorsa **mesaj isteklerine** düşer | Doğrulandı. Yorum cevabındaki "mesaj isteklerine bak" bu yüzden. |
| Devam mesajı yalnız kişi **cevap yazarsa**, cevaptan sonraki **24 saat** içinde | Doğrulandı |
| Mesaj metni en çok **1000 bayt** (UTF-8) | Send API sayfasında doğrulandı; Private Reply için aynısı varsayıldı |
| Hız sınırı: Private Reply **saatte 750** | Doğrulandı |
| Devam mesajları (normal DM) için uç nokta | Unified'da **doğrulanamadı**. Bot `POST /<IG_ID>/messages`, `recipient: {id: <IGSID>}` kullanıyor. |

**Çok mesajlı DM'nin yolu:** yoruma yalnız bir Private Reply hakkı var, bu yüzden tek seferde 3 mesaj atılamaz. Bot şunu yapar:

1. İlk mesaj Private Reply olarak gider; sonuna devam daveti eklenir ("Kalan 2 mesajı göndermem için bu mesaja bir şey yaz…").
2. Kişi DM'ye herhangi bir şey yazınca Meta `messages` webhook'u yollar; bot kişiyi tanır ve 24 saat penceresi açıkken kalan mesajları 1,5 sn arayla gönderir.
3. Kişi 7 gün içinde cevap yazmazsa devam mesajları iptal olur (`zamanlama.bekleyen_gecerlilik_saat`).

Kişi tanıma: Private Reply yanıtındaki `recipient_id` ile `messages` olayındaki `sender.id` eşleştirilir; yedek olarak yorumdaki `from.id` da saklanır. Bu iki değerin aynı olduğu dokümanda açıkça yazmıyor (**doğrulanamadı**), bu yüzden ikisi de tutuluyor. Çok mesajlı kampanyayı test hesabıyla mutlaka dene.

Alternatif: tek mesaja sığdırıp ayrıntıyı bir sayfaya (Notion, GitHub Gist) koymak ve linkini vermek. Daha az sürtünme, ama link tıklatır.

---

## 11. Sorun giderme

| Belirti | Bak |
|---|---|
| Meta "Verify and save" hata veriyor | Bot ve ngrok açık mı (`/saglik`)? Verify token iki yerde birebir aynı mı? Callback URL `/webhook` ile bitiyor mu? |
| Logda "İmzası geçersiz webhook reddedildi" | `META_APP_SECRET` yanlış ya da eksik kopyalanmış. |
| Logda "KURULUM MODUNDA başladı" | `.env`'de `META_APP_SECRET` ya da `IG_ACCESS_TOKEN` eksik; satırda hangisi olduğu yazar. |
| "config.json bulunamadı" | `config.example.json`'ı `config.json` olarak kopyala. |
| "Instagram hesabı bulunamadı" / "hesap listesi boş döndü" | `.env`'de `IG_USER_ID` boş; kimliği yaz (§4 adım 4). Doluyken "Hesap bilgisi alınamadı" çıkarsa jetonun o hesaba erişimi yok: configuration'da hesap Business assets olarak seçili mi? |
| Logda "JETON GEÇERSİZ" (Meta kod 190) | Jeton iptal edilmiş ya da süresi dolmuş. §4 adım 4 ile yenisini al, `.env`'e yaz. |
| Webhook hiç gelmiyor | Hesap herkese açık mı? `comments`/`messages` abone mi? §7 adım 5 yapıldı mı? Yorum yapan hesabın rolü yoksa §4 "Geliştirme modu". |
| DM hatası `(kod 10)` ya da `(kod 200)` | İzin eksik: configuration'da `instagram_manage_messages` var mı, jetonu yeniden al; §4 adım 7. |
| DM hatası, yorum 7 günden eski | Private Reply süresi dolmuş; yapılacak bir şey yok. |
| "Jeton yenilenemedi" (yalnız `API_TURU=instagram`) | 60 günlük jeton geçmiş ya da iptal edilmiş. Yeni jeton al, `.env`'e yaz. |
| "Port 8787 açılamadı" | Botun bir kopyası zaten açık. Açık pencereyi kapat ya da `gorev-sil.ps1`. |
| "ngrok bulunamadı" | §3 adım 2; `NGROK_YOLU`. |
| Aynı kişiye tekrar göndermek istiyorum (test) | Kayıt `data/bot.sqlite`'ta. Botu durdur, o kişinin o kampanyadaki kaydını sil (yapay zekâ asistanına "data/bot.sqlite'ta @kullanici için REHBER kaydını sil, önce yedek al" diyebilirsin). Dosyanın tamamını silersen ilk açılış işaretlemesi baştan yapılır. |
| Alakasız yorumlar tetikliyor ("hat" gibi günlük kelimeler) | Kampanyada `"eslesme": "tam"` ya da `gonderi_id` (UYARLAMA.md). |

Log satırı örnekleri: `KURU @ornek_kisi "REHBER lütfen" → REHBER (gönderi 1790…): GÖNDERİLMEDİ (DRY_RUN)…`, `BILGI @ornek_kisi "rehber" → REHBER (gönderi 1790…): DM gönderildi + yorum cevabı yazıldı`, `UYARI POST /…/messages geçici hata (…); 2 sn sonra 2. deneme`. Jeton ve secret loglara `***` olarak yazılır. Log saatleri İstanbul saatiyle; değiştirmek için UYARLAMA.md §6.

---

## 12. Doğrulanamayanlar

Resmî dokümandan teyit edilemedi; kendi kurulumunda ilk gerçek testte kontrol et:

1. Geliştirme modunda (Standard Access) rolü olmayan kişilerin yorumları için webhook gelip gelmediği; dokümanlar çelişkili (§4). Bir hesapta geldiği görüldü, genel kural olarak doğrulanmadı.
2. Webhook imzasının hangi secret'la atıldığı (bot `META_APP_SECRET` ve `IG_APP_SECRET`'ın ikisini de kabul ediyor).
3. Botun kendi yazdığı herkese açık cevabın `comments` webhook'u olarak geri gelip gelmediği. Gelirse bot onu kendi hesabın olarak tanıyıp atlıyor (kimlik, kullanıcı adı ve kalıp cevap metniyle üç ayrı kontrol; yerel testte doğrulandı).
4. Yorum listesinde (`/<MEDYA_ID>/comments`) `from` alanının dönüp dönmediği (dönmezse bot `username` ile devam ediyor).
5. Private Reply'in `recipient_id` değeri ile `messages` olayındaki `sender.id`'nin aynı olduğu (ikisi de saklanıyor).
6. Unified'da normal DM (devam mesajları) uç noktası.
7. Private Reply metninin sınırı (Send API'deki 1000 bayt varsayıldı).
8. Hız sınırı hata kodlarının Instagram'daki karşılığı (bot Graph API genel kodlarına ve `is_transient` bayrağına bakıyor).
9. ngrok ücretsiz planda aylık istek sınırı dolunca ne olduğu.
10. Instagram'daki "Bağlı araçlar → Mesajlara erişime izin ver" ayarının adı ve zorunluluğu; portföye Instagram hesabı ekleme menüsünün adı; hesap kimliğinin panelde görüldüğü yer.
11. Panelin "Generate access tokens" düğmesiyle alınan jetonun süresiz olup olmadığı; configuration'daki Redirect/Login URL alanlarının bu yolda gerekip gerekmediği.
12. Live moda geçişin veri silme adresi isteyip istemediği.

---

## 13. Kaynaklar

Kasım 2026'da okundu:

- Unified Login: https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login · başlangıç: https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/get-started · kimlik doğrulama: https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/authentication · izinler: https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/permissions
- Facebook Login for Business (SUAT, süre): https://developers.facebook.com/docs/facebook-login/facebook-login-for-business
- Instagram mesajlaşma webhook'ları: https://developers.facebook.com/documentation/business-messaging/instagram-messaging/webhooks
- Private Replies: https://developers.facebook.com/docs/instagram-platform/private-replies
- Webhooks: https://developers.facebook.com/docs/instagram-platform/webhooks · kurulum: https://developers.facebook.com/documentation/instagram-platform/webhooks/setup · örnek gövdeler: https://developers.facebook.com/docs/instagram-platform/webhooks/examples
- Instagram Login ve jeton yenileme: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login · https://developers.facebook.com/docs/instagram-platform/reference/refresh_access_token
- Yorum yönetimi: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/comment-moderation
- Mesajlaşma (Send API, 1000 bayt): https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api
- Yorum ve medya listesi: https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-media/comments · https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media
- App Review ve erişim seviyeleri: https://developers.facebook.com/docs/instagram-platform/app-review · uygulama modları: https://developers.facebook.com/docs/development/build-and-test/app-modes
- Hız sınırları: https://developers.facebook.com/docs/graph-api/overview/rate-limiting
- ngrok: https://ngrok.com/docs/ · ücretsiz plan sınırları: https://ngrok.com/docs/pricing-limits/free-plan-limits
