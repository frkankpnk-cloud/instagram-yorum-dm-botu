// Botun giriş noktası: npm start (ya da bekçi üzerinden). Ayarları okur, jetonu hazırlar, sunucuyu açar,
// kaçanları yakalar ve periyodik işleri (jeton yenileme, süresi dolan bekleyenler) kurar.
//
// İki mod:
//  - KURULUM: .env'de yalnız WEBHOOK_VERIFY_TOKEN (ve NGROK_URL) varken. Sunucu açılır, Meta'nın webhook
//    doğrulaması (GET) geçer, gelen olaylar imzası doğruysa loglanır ama hiçbir işlem yapılmaz. Meta'da sıra
//    önce webhook doğrulaması, sonra jeton olduğu için bu mod gerekli.
//  - TAM: jeton + secret varken. DRY_RUN'a göre KURU ya da CANLI çalışır.
import fs from "node:fs";
import { envYukle, ortamAyarlari, ConfigOkuyucu } from "./ayarlar.mjs";
import { logOlustur, gizliEkle } from "./log.mjs";
import { Kayit } from "./db.mjs";
import { GraphIstemci } from "./api.mjs";
import { JetonYonetici } from "./jeton.mjs";
import { Isleyici } from "./isleyici.mjs";
import { Kuyruk } from "./kuyruk.mjs";
import { sunucuOlustur } from "./sunucu.mjs";
import { kacanlariYakala } from "./kacanlar.mjs";

const SAAT = 3600_000;

async function main() {
  envYukle();
  const ayar = ortamAyarlari();
  const log = logOlustur({ klasor: ayar.logKlasoru });
  for (const g of [...ayar.imzaSirlari, ayar.erisimJetonu, ayar.dogrulamaJetonu]) gizliEkle(g);

  if (!ayar.dogrulamaJetonu) {
    log.hata(".env'de WEBHOOK_VERIFY_TOKEN boş. .env.example'ı .env olarak kopyalayıp en az bunu doldur (KURULUM.md §5).");
    process.exit(1);
  }
  if (ayar.apiTuruHam !== ayar.apiTuru) log.uyari(`API_TURU="${ayar.apiTuruHam}" tanınmadı; "${ayar.apiTuru}" kullanılıyor`);

  const kuyruk = new Kuyruk(log);
  const eksik = [];
  if (!ayar.erisimJetonu) eksik.push("IG_ACCESS_TOKEN");
  if (!ayar.imzaSirlari.length) eksik.push("META_APP_SECRET");
  let tamKurulum = null;
  if (!eksik.length) {
    tamKurulum = await tamModuHazirla({ ayar, log, kuyruk });
    if (!tamKurulum) eksik.push("geçerli jeton / Instagram hesabı");
  }
  const kurulumModu = !tamKurulum;
  const isleyici = tamKurulum?.isleyici ?? null;

  const sunucu = sunucuOlustur({ ayar, isleyici, kuyruk, log });
  log.bilgi("──────────────────────────────────────────");
  if (kurulumModu) {
    log.bilgi(`IG otomasyon KURULUM MODUNDA başladı (eksik: ${eksik.join(", ")})`);
    log.bilgi("Webhook doğrulaması (Meta 'Verify and save') çalışır; yorum/DM İŞLENMEZ. Eksikleri .env'e yazınca bot yeniden başlar (bekçi altında kendiliğinden).");
  } else {
    tamKurulum.baslik();
  }

  await new Promise((ok, hata) => {
    sunucu.once("error", hata);
    // Yalnız yerel ağ arayüzü: dışarıdan erişim sadece ngrok tüneliyle.
    sunucu.listen(ayar.port, "127.0.0.1", ok);
  }).catch((e) => {
    log.hata(`Port ${ayar.port} açılamadı: ${e.message}. Başka bir bot kopyası açık olabilir.`);
    process.exit(1);
  });
  log.bilgi(`Webhook dinleniyor: http://127.0.0.1:${ayar.port}/webhook${ayar.ngrokUrl ? ` · dış adres ${ayar.ngrokUrl.replace(/\/$/, "")}/webhook` : ""}`);

  if (tamKurulum) tamKurulum.periyodikIsler();

  const kapat = async (neden) => {
    log.bilgi(`${neden}; kapanıyor…`);
    sunucu.close();
    await Promise.race([kuyruk.bosalinca(), new Promise((r) => setTimeout(r, 10_000))]);
    tamKurulum?.kayit.kapat();
    process.exit(0);
  };
  process.on("SIGINT", () => kapat("SIGINT alındı"));
  process.on("SIGTERM", () => kapat("SIGTERM alındı"));

  // Bekçi altında .env değişince (jeton eklendi, DRY_RUN=false yapıldı…) bot düzgünce kapanır,
  // bekçi birkaç saniye içinde yeni ayarlarla yeniden açar. Elle "npm start" ile açıldıysa yalnız uyarır.
  if (fs.existsSync(ayar.envYolu)) {
    fs.watchFile(ayar.envYolu, { interval: 3000 }, (simdi, once) => {
      if (simdi.mtimeMs === once.mtimeMs) return;
      if (ayar.bekciAltinda) kapat(".env değişti, yeni ayarlarla yeniden başlamak için");
      else log.uyari(".env değişti; yeni ayarlar için botu yeniden başlat (Ctrl+C, sonra npm start)");
    });
  }
}

// Jeton ve secret varken: kayıt, jeton, hesap kimliği, işleyici. Hesap bulunamazsa süreç durur (bekçi yeniden dener).
async function tamModuHazirla({ ayar, log, kuyruk }) {
  const config = new ConfigOkuyucu(ayar.configYolu, log);
  const cfg = config.al(); // hatalıysa burada açıkça durur
  const kayit = new Kayit(ayar.dbYolu);
  const jeton = new JetonYonetici({
    envJeton: ayar.erisimJetonu,
    kayit,
    log,
    yenilenebilir: ayar.apiTuru === "instagram",
  }).baslat();
  const istemci = new GraphIstemci({ kok: ayar.apiKok, surum: ayar.apiSurum, jeton: () => jeton.mevcut(), log, tur: ayar.apiTuru });

  let ben;
  try {
    ben = await istemci.ben(ayar.igKullaniciId);
  } catch (e) {
    const ek = e.jetonGecersiz ? " Jeton geçersiz ya da iptal edilmiş; yenisini al (KURULUM.md §4)." : " KURULUM.md §4'e bak.";
    if (!ayar.igKullaniciId) {
      // Kapanmak yerine kurulum moduna düş: webhook doğrulaması ayakta kalsın, .env düzelince bot yeniden başlar.
      log.hata(`Instagram hesabı bulunamadı (${e}).${ek}`);
      kayit.kapat();
      return null;
    }
    log.uyari(`Hesap bilgisi alınamadı (${e}); .env'deki IG_USER_ID ile devam ediliyor.${ek}`);
    ben = { userId: ayar.igKullaniciId, kullanici: null };
  }
  if (ben.digerHesaplar) log.uyari(`Jetona ${ben.digerHesaplar + 1} Instagram hesabı atanmış; ilki kullanılıyor. Başkasıysa .env'de IG_USER_ID ver.`);
  if (ayar.apiTuru === "instagram" && ayar.igKullaniciId && ben.userId && ayar.igKullaniciId !== ben.userId) {
    log.uyari(`IG_USER_ID (${ayar.igKullaniciId}) ile jetonun hesabı (${ben.userId}) farklı; jetonun hesabı kullanılıyor`);
  }

  const isleyici = new Isleyici({ kayit, istemci, config, ben, dryRun: ayar.dryRun, log });

  return {
    kayit,
    isleyici,
    baslik() {
      const aktif = cfg.kampanyalar.filter((k) => k.aktif).map((k) => k.kelime);
      log.bilgi(`IG otomasyon başladı · hesap @${ben.kullanici ?? "?"} (${ben.userId}) · API ${ayar.apiTuru} (${ayar.apiKok})`);
      log.bilgi(
        ayar.dryRun
          ? "MOD: KURU (DRY_RUN=true) · eşleşmeler loglanır, hiçbir DM/yorum GÖNDERİLMEZ"
          : "MOD: CANLI (DRY_RUN=false) · eşleşen yorumlara DM ve yorum cevabı GÖNDERİLİR"
      );
      log.bilgi(`Aktif kampanyalar: ${aktif.length ? aktif.join(", ") : "yok (config.json'da aktif:true yap)"}`);
      if (ayar.apiTuru === "unified") log.bilgi("Jeton: sistem kullanıcısı jetonu (süresiz), otomatik yenileme gerekmiyor");
    },
    periyodikIsler() {
      kuyruk.ekle("kacanlari-yakala", () => kacanlariYakala({ istemci, kayit, isleyici, config, ben, log }));
      if (jeton.yenilenebilir) {
        const jetonKontrol = () => kuyruk.ekle("jeton-kontrol", () => jeton.kontrol(istemci));
        setTimeout(jetonKontrol, 60_000).unref();
        setInterval(jetonKontrol, 6 * SAAT).unref();
      }
      setInterval(() => {
        const n = kayit.bekleyenleriSuresiDoldur();
        if (n) log.bilgi(`${n} devam mesajı cevap gelmediği için süresi doldu`);
      }, SAAT).unref();
      setInterval(() => {
        const o = kayit.ozet(isleyici.mod);
        log.bilgi(`Günlük özet (${isleyici.mod}): ${o.kampanyalar.map((k) => `${k.kampanya} ${k.adet}`).join(", ") || "gönderim yok"}`);
      }, 24 * SAAT).unref();
    },
  };
}

main().catch((e) => {
  console.error(`Başlatma hatası: ${e?.message || e}`);
  process.exit(1);
});
