# Sık sorulanlar

**Ücretsiz mi?**
Kod ücretsiz. Meta'nın API'si bu kullanım için ücret istemiyor, ngrok'un ücretsiz planı yetiyor (Kasım 2026). Bilgisayarın açık kaldığı için elektrik dışında maliyet yok. Bir gün Meta App Review ya da işletme doğrulaması isterse o da ücretsiz, ama zaman alır.

**ManyChat'in yerini tamamen tutar mı?**
Hayır. Yalnız "yoruma kelime yaz → DM al → yoruma cevap" işini yapıyor. Akış tasarımı, butonlar, e-posta toplama, hikâye cevapları, panel, istatistik yok. Bunlara ihtiyacın varsa ManyChat ya da benzeri bir araç daha doğru.

**Bilgisayarım kapalıyken ne olur?**
O sırada gelen yorumlara DM gitmez. Bot açılınca son 72 saatteki yorumları tarar ve kaçanlara gönderir (Meta yoruma 7 gün içinde cevap izni veriyor). Uzun süre kapalı kalacaksan botu sürekli açık bir makineye taşı (UYARLAMA.md §6).

**DM neden "mesaj istekleri"ne düşüyor?**
Kişi seni takip etmiyorsa Instagram mesajı istek klasörüne koyar; bu Meta'nın kuralı. Yorum cevabındaki "mesaj isteklerine de bak" cümlesi bu yüzden var.

**Neden tek seferde birden çok mesaj atmıyor?**
Meta bir yoruma yalnız bir özel cevap (Private Reply) izni veriyor. İkinci mesaj ancak kişi DM'ye bir şey yazarsa ve 24 saat içinde gidebilir. Bot bunu "devam için bir şey yaz" davetiyle çözüyor (KURULUM.md §10). Daha basit yol: tek mesaj + bir link.

**Uygulamamı Live moda almam ya da App Review'dan geçmem gerekir mi?**
Belki. Meta'nın dokümanları çelişkili. Önce geliştirme modunda dene; uygulamada rolü olmayan birinin yorumu gelmiyorsa Live moda al, o da yetmezse App Review. Ayrıntı: KURULUM.md §4.

**Hesabım kapanır mı, spam sayılır mı?**
Bot Meta'nın resmî API'sini ve resmî sınırlarını kullanıyor, yine de garanti veremem. Herkese açık cevapları listeden dönüşümlü yaz, aynı kişiye tekrar gönderme (bot zaten göndermiyor), istenmeyen mesaj atma. Meta'nın kurallarına uymak senin sorumluluğun.

**Gizli hesapta çalışır mı?**
Hayır. Hesap profesyonel (İşletme ya da İçerik üreticisi) ve herkese açık olmalı.

**Birden çok Instagram hesabı?**
Bu sürüm tek hesap için. İkinci hesap için klasörü kopyalayıp ayrı `.env`, ayrı `PORT` ve ayrı tünelle çalıştırmak en basit yol (denenmedi).

**Mac'te / Linux'ta çalışır mı?**
Kod Node olduğu için çalışması beklenir, ama denenmedi. Otomatik başlatma betikleri yalnız Windows için; UYARLAMA.md §6.

**Yapay zekâ asistanıma kurdurabilir miyim?**
Evet, repo bunun için hazırlandı. README.md'nin en üstündeki "Yapay zekâna şunu söyle" metnini kullan; hangi aracı kullandığın fark etmez. Araç `AGENTS.md`'deki kuralları okur: `.env`'ini okumaz, hesabına girmez, önce KURU dener. Meta panelindeki tıklamaları sen yaparsın.

**Bir hata buldum / bir şey çalışmıyor.**
Önce KURULUM.md §11 (sorun giderme). Logu paylaşacaksan içinden kullanıcı adlarını ve kimlikleri çıkar; jeton loglarda zaten `***` görünür.
