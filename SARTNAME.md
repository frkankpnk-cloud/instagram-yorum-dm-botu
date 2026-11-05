# Şartname (Ders 1)

Ders 1 videosunda gösterilen şartname. Metin, videodaki "Üç kâğıt" slaytıyla kelimesi kelimesine aynı; tek değişiklik Markdown kod bloğuna alınması.

**Ne işe yarar:** bu üç parçayı sırayla boş bir klasörde Claude Code'a (ya da kullandığın yapay zekâ aracına) verirsen, botu sıfırdan yazdırırsın. 5 Kasım 2026'da boş bir klasörde prova edildi: 12 kaynak dosya, ek paket yok, testler 15/15.

**Bu repodaki botla ilişkisi:** bu repodaki bot aynı kurallarla çalışır ama bu metinden birebir üretilmedi; bazı ayrıntılar farklı (ör. port 8787, kuru modda da kaçan yorum taraması). Hazır botu kurmak için şartnameye gerek yok: klasörü aç, `kur` yaz ([README](README.md)).

Her parça Instagram DM sınırının (1.000 bayt) altında kalsın diye üçe bölündü.

## 1/3 (764 bayt)

```text
ŞARTNAME 1/3 · Instagram yorum → DM botu

Bana bu klasörde bir Instagram yorum → DM botu yaz. Önce plan çıkar, onayımı bekle.

Teknik sınırlar:
- Node.js 22.13+, npm paketi yok. Yalnız http, crypto, fetch ve node:sqlite. package.json'da "test": "node --test".
- Meta'nın resmî Instagram API'si (Unified login, graph.facebook.com). Sürümü ve uç noktaları (Private Reply, yorum cevabı) resmî dokümandan oku, tahmin etme; plana kaynağı yaz.
- Gizli bilgiler yalnız .env'de: META_APP_SECRET, IG_ACCESS_TOKEN, IG_USER_ID (benim hesabım), WEBHOOK_VERIFY_TOKEN, DRY_RUN, PORT (varsayılan 8788). .env.example yaz, .env'i asla okuma.
- Varsayılan DRY_RUN=true: eşleşmeyi loga yazsın, hiçbir şey göndermesin, Meta'ya hiç istek atmasın.
```

## 2/3 (734 bayt)

```text
ŞARTNAME 2/3 · Akış

1) GET /webhook: Meta doğrulaması (verify token).
2) POST /webhook: X-Hub-Signature-256 imzasını ham gövde ve app secret ile doğrula; bozuksa 403. Hemen 200 dön, yorumu sıralı kuyrukta işle. Yorum kimliği comment_id ya da id gelebilir, ikisini de kabul et.
3) Yorum benim hesabımdansa atla (from.id = IG_USER_ID).
4) Kelime eşleşmesi Türkçe ve büyük/küçük harf duyarsız (LİMİT = limit = lımıt), tam kelime ("limitsiz" tetiklemez).
5) Aynı kişiye aynı kampanya ikinci kez gitmesin (SQLite). KURU mod bunu kilitlemesin.
6) Önce Private Reply ile DM, sonra yoruma herkese açık cevap. DM gitmezse cevap yazma.
7) DM en çok 1000 bayt (Türkçe harf 2 bayt); kaydederken kontrol et.
```

## 3/3 (768 bayt)

```text
ŞARTNAME 3/3 · Ayar ve test

- Kampanyalar config.json'da: kelime, eş anlamlılar, DM metni, yorum cevabı, gönderi kimliği (boşsa tümü), aktif. Bot dosya değişince yeniden okusun.
- CANLI açılışta son 72 saatin kaçan yorumlarını tara; veritabanında ilk tarama kaydı yoksa yalnız "görüldü" işaretle, eski yorumlara DM atma. KURU modda tarama yok.
- GET /saglik: {"ok":true,"mod":"kuru"|"canli"} dönsün.
- Log okunur olsun, jeton ve secret *** ile maskelensin.
- test/ klasörüne node --test testleri yaz: eşleşme, imza, tekrar engeli, kendi yorumunu atlama, DM hatasında cevap yazmama.
- Bir de imzalı sahte webhook gönderen komut yaz: npm run sahte ("limit lütfen") ve npm run sahte:bozuk (bozuk imza). Meta'ya bağlanmadan deneyeyim.
```

