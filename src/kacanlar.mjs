// "Kaçanları yakala": bot kapalıyken gelen yorumlar webhook ile bir daha gelmeyebilir.
// Açılışta son gönderilerin üst düzey yorumları taranır, görülmemiş olanlar normal akıştan geçer.
import { kisiAnahtari } from "./isleyici.mjs";

// Not: Meta yorum listesi yalnız üst düzey yorumları ve en çok 50'şer kayıt döndürür.

export async function kacanlariYakala({ istemci, kayit, isleyici, config, ben, log, simdi = () => Date.now() }) {
  const cfg = config.al();
  const ayar = cfg.kacanlar;
  if (!ayar.aktif) {
    log.bilgi("Kaçanları yakala kapalı (config.kacanlar.aktif=false)");
    return { taranan: 0, islenen: 0, isaretlenen: 0 };
  }
  if (!cfg.kampanyalar.some((k) => k.aktif)) {
    log.bilgi("Kaçanları yakala: aktif kampanya yok, tarama atlandı");
    return { taranan: 0, islenen: 0, isaretlenen: 0 };
  }
  const mod = isleyici.mod;
  const ilkAcilis = !kayit.ayarAl(`ilk_tarama_${mod}`);
  const yalnizIsaretle = ilkAcilis && ayar.ilk_acilista_yalniz_isaretle;
  const sinir = simdi() - Number(ayar.en_eski_saat) * 3600_000;
  let taranan = 0;
  let islenen = 0;
  let isaretlenen = 0;

  let medyalar;
  try {
    medyalar = await istemci.medyalar(ben.userId, Number(ayar.son_gonderi_sayisi) || 10);
  } catch (e) {
    log.hata(`Kaçanları yakala: gönderi listesi alınamadı: ${e}`);
    return { taranan, islenen, isaretlenen, hata: true };
  }
  for (const m of medyalar) {
    let yorumlar;
    try {
      yorumlar = await istemci.yorumlar(m.id);
    } catch (e) {
      log.uyari(`Kaçanları yakala: ${m.id} yorumları alınamadı: ${e}`);
      continue;
    }
    for (const c of yorumlar) {
      const zaman = c.timestamp ? Date.parse(c.timestamp) : null;
      if (zaman && zaman < sinir) continue;
      const y = {
        id: String(c.id),
        metin: c.text ?? "",
        kisiId: c.from?.id ? String(c.from.id) : null,
        kullanici: c.from?.username ?? c.username ?? null,
        mediaId: String(m.id),
        zaman,
      };
      taranan++;
      if (kayit.yorumGoruldu(y.id, mod)) continue;
      if (yalnizIsaretle) {
        kayit.yorumIsaretle({ ...y, kisiAnahtar: kisiAnahtari(y) }, mod);
        isaretlenen++;
        continue;
      }
      const sonuc = await isleyici.yorumIsle(y, { kaynak: "kacanlar" });
      if (sonuc === "tamam" || sonuc === "kuru") islenen++;
    }
  }
  kayit.ayarYaz(`ilk_tarama_${mod}`, new Date(simdi()).toISOString());
  if (yalnizIsaretle) {
    log.bilgi(`Kaçanları yakala (ilk açılış): ${isaretlenen} eski yorum DM'siz "görüldü" işaretlendi; bundan sonrası işlenecek`);
  } else {
    log.bilgi(`Kaçanları yakala: ${medyalar.length} gönderi, son ${ayar.en_eski_saat} saatte ${taranan} yorum tarandı, ${islenen} kaçan yorum işlendi`);
  }
  return { taranan, islenen, isaretlenen };
}
