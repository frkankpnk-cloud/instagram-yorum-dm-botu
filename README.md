# Instagram yorum → DM botu

> **In English:** A self-hosted Instagram comment-to-DM bot, a free alternative to ManyChat's "comment a keyword, get a DM" flow. When someone comments a keyword on your post, it sends them a DM through Meta's official Private Replies API and posts a short public reply. Plain Node.js (22.13+) with zero npm dependencies, runs on your own computer behind an ngrok tunnel, dry-run mode by default. Documentation is in Turkish; open the folder in Claude Code or Codex and type `kur` ("install") to be guided step by step.

## Claude Code ile kurulum: klasörü aç, `kur` yaz

1. Repoyu indir (yeşil **Code** düğmesi → **Download ZIP**, sonra klasöre çıkar) ya da `git clone`.
2. Klasörü **Claude Code**'da aç (Codex'te de aynı: klasörde `codex` çalıştır).
3. Sohbete yalnız şunu yaz:

```text
kur
```

Araç `CLAUDE.md` / `AGENTS.md`'deki talimatı okur ve seni 10 aşamada götürür: bilgisayarını kontrol eder, testleri çalıştırır, ngrok ve Meta panelinde nereye tıklayacağını sırayla söyler, her aşamada bir log satırıyla doğrular, kampanyanı yazar, önce KURU modda dener. Meta, Instagram ve ngrok panellerindeki tıklamaları ve `.env`'e gizli değerleri **sen** yaparsın; araç hesabına girmez, `.env`'ini okumaz, canlıya geçme kararını sana bırakır.

Cursor, Gemini CLI ya da başka bir araç kullanıyorsan aşağıdaki uzun metni yapıştır.

## Yapay zekâna şunu söyle

Kod bilmen gerekmiyor. Bu repoyu bilgisayarına indir (yeşil **Code** düğmesi → **Download ZIP**, sonra klasöre çıkar), klasörü kullandığın yapay zekâ aracında aç (Claude Code, Codex, Cursor, Gemini CLI ya da hangisini kullanıyorsan) ve aşağıdaki metni olduğu gibi yapıştır:

```text
Bu klasördeki Instagram yorum → DM botunu benim Instagram hesabım için kurmama yardım et.
Önce AGENTS.md'yi, README.md'yi ve KURULUM.md'yi oku; KURULUM.md'deki kontrol listesini sırayla takip et.
Kod bilmiyorum: her adımı tek tek, ne işe yaradığıyla anlat; bir adım bitmeden sonrakine geçme.
Meta, Instagram ve ngrok panellerindeki tıklamaları ben yapacağım; sen hesaplarıma girme, bana nereye tıklayacağımı söyle.
.env dosyasını okuma; içine ne yazacağımı söyle, ben doldururum. Jeton, secret ya da şifreyi asla ekrana, loga ya da sohbete yazma.
Her şeyi önce KURU modda (DRY_RUN=true) test et; canlıya geçmeye ben karar veririm.
Kampanyam: kelime [KELİMEN], DM metni [METNİN], [tüm gönderilerde / şu Reels'te: LİNK].
```

**Bilmen gereken:** yapay zekâ aracı senin yerine hiçbir hesaba girmez. Meta geliştirici panelindeki adımları (uygulama oluşturma, izinler, jeton alma, webhook doğrulama), Instagram'daki davet ve mesaj ayarını, ngrok hesabını **sen kendi elinle** yaparsın; araç sana sırayla nereye tıklayacağını söyler. `.env`'e gizli değerleri de sen yazarsın. Gerisini (dosyaları hazırlamak, test etmek, kampanyanı yazmak, hataları okumak) araç yapar. Canlıya almadan önce ne değiştirdiğine kendin de bak.

---

Biri Reels'ine belirlediğin kelimeyi yorum olarak yazar ("REHBER" gibi), bot ona **DM'den** mesajı gönderir ve yoruma herkese açık kısa bir cevap yazar. ManyChat'in yaptığı işin temel kısmı; ama Meta'nın resmî API'siyle, **kendi bilgisayarında**, ücretsiz.

ManyChat'in ücretsiz planı kişi sınırına dayanınca bu botu kendim yazdım ve kendi hesabımda çalıştırıyorum. Kodu açık bırakıyorum: indir, kendi hesabına göre düzenle, istersen yapay zekâ asistanına kurdur.

> **Videoda anlattım:** [YOUTUBE LİNKİ · yayında eklenecek]

<!-- [EKRAN GÖRÜNTÜSÜ · yayında eklenecek] Önerilen: solda yorum ("REHBER"), sağda gelen DM; bot logunda "DM gönderildi + yorum cevabı yazıldı" satırı. Kullanıcı adları bulanık. -->
**[EKRAN GÖRÜNTÜSÜ · yayında eklenecek]**

---

## Ne yapar

- **Kelimeyle tetiklenir.** Büyük/küçük harf ve Türkçe karakter fark etmez: `LİMİT`, `limit`, `lımıt`, `Limit!!` aynı sayılır; `limitsiz` tetiklemez.
- **Önce DM, sonra yorum cevabı.** DM Meta'nın resmî "Private Reply" yoluyla gider. DM gitmezse herkese açık "gönderdim" cevabı da yazılmaz.
- **Aynı kişiye iki kez göndermez**, kendi yorumlarına cevap vermez.
- **Tek gönderiye ya da tüm gönderilere bağlanabilir.** Herkese açık cevaplar listeden dönüşümlü seçilebilir (aynı cümle yüzlerce kez spam gibi görünür).
- **Çok mesajlı DM:** Instagram yoruma tek mesaj hakkı veriyor; bot ilk mesajın sonuna "devam için bir şey yaz" ekler, kişi cevap yazınca kalanları gönderir.
- **Kaçanları yakalar:** bot kapalıyken gelen yorumları açılışta tarar (varsayılan son 72 saat).
- **KURU mod varsayılan:** sen `DRY_RUN=false` yazana kadar hiçbir şey göndermez, yalnız loga yazar.
- **npm paketi yok.** Node'un kendi modülleri ve yerleşik SQLite'ı yetiyor; `npm install` bile gerekmiyor.

## 10 dakikada özet kurulum (elle yapmak istersen)

Gerçek süre Meta panelinde ne kadar oyalandığına bağlı; ilk seferde 30–60 dakika sürebilir. Adımların tamamı ve ekran adları [KURULUM.md](KURULUM.md)'de.

1. **Gerekenler:** Node.js 22.13 veya üstü · **profesyonel ve herkese açık** Instagram hesabı · ücretsiz [ngrok](https://ngrok.com) hesabı · Meta geliştirici hesabı.
2. **Klasörü hazırla:**
   ```bash
   cp .env.example .env
   ```
   ```bash
   cp config.example.json config.json
   ```
   (Windows'ta Dosya Gezgini'nde kopyalayıp adını değiştirmen de olur.)
3. **ngrok:** kur, authtoken'ı ekle, ücretsiz sabit adresini `.env`'de `NGROK_URL`'ye yaz. `.env`'de `WEBHOOK_VERIFY_TOKEN`'a uzun rastgele bir kelime yaz.
4. **Botu aç:** `npm run bekci` → bot "kurulum modunda" açılır.
5. **Meta:** uygulama oluştur → Instagram hesabını bağla → webhook'u doğrula (`https://<ngrok-adresin>/webhook`) → `comments` ve `messages`'a abone ol → jetonu al.
6. **`.env`'i tamamla:** `META_APP_SECRET`, `IG_ACCESS_TOKEN`, `IG_USER_ID`. Bot kendisi KURU moda geçer.
7. **Dene:** `npm test`, sonra `npm run sahte -- --metin "REHBER"`, sonra başka bir hesaptan gerçek yorum. Logda `KURU … GÖNDERİLMEDİ (DRY_RUN)` görmelisin.
8. **Kendi kampanyanı yaz** ([UYARLAMA.md](UYARLAMA.md)), `aktif: true` yap, `.env`'de `DRY_RUN=false`. Bitti.

Kurulumu yapay zekâ aracına yaptırıyorsan en üstteki `kur` yolunu ya da hazır metni kullan. Araç kodu da senin isteğine göre değiştirebilir; [AGENTS.md](AGENTS.md) ona güvenlik kurallarını (sırları okumama, önce KURU, onaysız canlıya almama, hesaba girmeme) zaten söylüyor.

## Sınırlar (dürüst kısım)

- **Bilgisayarın açık ve uyanık olmalı.** Bot senin bilgisayarında çalışıyor; kapalıyken gelen yorumlar açılışta yakalanır (son 72 saat), ama DM gecikmeli gider. 7/24 için uyku modunu kapat ya da botu sürekli açık bir makineye taşı.
- **Geliştirme modu belirsiz.** Meta'nın dokümanları, uygulama "geliştirme modunda"yken uygulamada rolü olmayan kişilerin yorumları için webhook gelip gelmediği konusunda çelişkili. Benim hesabımda geldi (Kasım 2026); seninkinde gelmezse uygulamayı Live moda almak, o da yetmezse Meta'nın App Review sürecinden geçmek gerekebilir. Ayrıntı: KURULUM.md §4.
- **Meta'nın kuralları geçerli:** yorum başına tek DM, yorumdan sonraki 7 gün içinde; devam mesajları yalnız kişi cevap yazarsa ve 24 saat içinde; mesaj başına en çok 1000 **bayt** (Türkçe harf 2, emoji 4 bayt). Bunlar botun değil, Meta'nın sınırları.
- **ngrok ücretsiz planı** ayda 20.000 istek ve 1 GB veriyle sınırlı (Kasım 2026). Meta her yorumu ayrı istek olarak yollar; çok yorum alan viral bir videoda ay sonuna doğru dolabilir.
- **Windows'ta denendi.** Kod Node olduğu için macOS/Linux'ta da çalışması beklenir, ama otomatik başlatma betikleri yalnız Windows için. Diğer sistemler için not: UYARLAMA.md §6.
- **Meta API'si değişebilir.** Menü adları, sürüm numarası (`v26.0`) ve izin adları Kasım 2026'ya göre. Bir şey tutmazsa önce Meta'nın güncel dokümanına bak.
- **Sorumluluk sende.** Bu, Meta'yla ilişkisi olmayan kişisel bir proje. Botu spam için kullanma; Meta'nın Platform Koşulları'na ve Instagram kurallarına uy. Hesabındaki her gönderimden sen sorumlusun. Garanti yok (bkz. lisans).

## Dosyalar

| Dosya | Ne |
|---|---|
| [KURULUM.md](KURULUM.md) | Adım adım kurulum: ngrok, Meta, `.env`, test, 7/24 |
| [UYARLAMA.md](UYARLAMA.md) | Kendi kampanyan, kelime ve DM değiştirme, tek gönderiye bağlama, diğer sistemler |
| [SIK-SORULANLAR.md](SIK-SORULANLAR.md) | Kısa sorular, kısa cevaplar |
| [AGENTS.md](AGENTS.md) | Yapay zekâ aracı için kurulum akışı (`kur`), güvenlik kuralları ve sık hatalar (Codex, Cursor, Gemini CLI vb. okur) |
| [CLAUDE.md](CLAUDE.md) | Claude Code için: AGENTS.md'yi aynen yükler |
| `config.example.json` | Örnek kampanyalar → `config.json` olarak kopyalanır |
| `.env.example` | Gizli ayarların şablonu → `.env` olarak kopyalanır |
| `src/` · `test/` · `scripts/` | Kod, testler, Windows otomatik başlatma betikleri |

## Lisans

MIT. Kodu kopyalayabilir, değiştirebilir, kendi işinde kullanabilirsin; telif satırını koru. Garanti yok. Ayrıntı [LICENSE](LICENSE) dosyasında.
