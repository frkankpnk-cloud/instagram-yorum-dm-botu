// Asıl iş: yorum → kampanya eşleşmesi → Private Reply DM → herkese açık cevap; ve devam mesajları.
import { kampanyaBul, katla } from "./eslesme.mjs";
import { devamMetni, bayt, yorumCevaplari, yorumCevabiSec } from "./ayarlar.mjs";

const YEDI_GUN = 7 * 24 * 3600_000; // Private Reply yorumdan sonra 7 gün içinde gönderilebilir (Meta dokümanı)
const uyu = (ms) => new Promise((r) => setTimeout(r, ms));
const kisa = (s, n = 60) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};

// Webhook gövdesinden olayları çıkarır. Meta örneklerinde iki biçim var (entry[].changes[] ve
// entry[].field/value); ikisi de desteklenir. Gerçek gövde LOG_HAM=true ile loga yazdırılıp görülebilir.
export function webhookCoz(govde) {
  const olaylar = [];
  if (!govde || !Array.isArray(govde.entry)) return olaylar;
  for (const entry of govde.entry) {
    const degisimler = Array.isArray(entry.changes) ? entry.changes : entry.field ? [{ field: entry.field, value: entry.value }] : [];
    for (const d of degisimler) {
      if (d?.field !== "comments" || !d.value) continue;
      const v = d.value;
      // Instagram login örneğinde kimlik "id", Unified/Facebook login örneğinde "comment_id" adıyla geliyor.
      const yorumId = v.id ?? v.comment_id;
      if (!yorumId) continue;
      olaylar.push({
        tur: "yorum",
        hesapId: entry.id ? String(entry.id) : null,
        yorum: {
          id: String(yorumId),
          metin: v.text ?? "",
          kisiId: v.from?.id ? String(v.from.id) : null,
          kullanici: v.from?.username ?? null,
          mediaId: v.media?.id ? String(v.media.id) : null,
          urunTuru: v.media?.media_product_type ?? null,
          parentId: v.parent_id ?? null,
          zaman: entry.time ? Number(entry.time) * (Number(entry.time) < 1e12 ? 1000 : 1) : null,
        },
      });
    }
    for (const m of Array.isArray(entry.messaging) ? entry.messaging : []) {
      if (!m?.message) continue; // okundu/tepki vb. olaylar bu bot için önemsiz
      olaylar.push({
        tur: "mesaj",
        hesapId: entry.id ? String(entry.id) : null,
        mesaj: {
          gonderenId: m.sender?.id ? String(m.sender.id) : null,
          aliciId: m.recipient?.id ? String(m.recipient.id) : null,
          metin: m.message.text ?? "",
          echo: m.message.is_echo === true,
          mid: m.message.mid ?? null,
        },
      });
    }
  }
  return olaylar;
}

// Kişiyi tekrar DM'den korumak için anahtar: Instagram kimliği yoksa kullanıcı adı, o da yoksa yorum.
export function kisiAnahtari(y) {
  return y.kisiId ? y.kisiId : y.kullanici ? "u:" + katla(y.kullanici) : "c:" + y.id;
}

// Aynı kişi webhook'ta kimlikle, kaçanları yakala listesinde (from dönmezse) kullanıcı adıyla gelebilir.
// İkisi de kontrol edilir ve kaydedilir; yoksa aynı kişiye iki DM gidebilirdi.
export function kisiAnahtarlari(y) {
  const a = [];
  if (y.kisiId) a.push(y.kisiId);
  if (y.kullanici) a.push("u:" + katla(y.kullanici));
  return a.length ? a : ["c:" + y.id];
}

export class Isleyici {
  constructor({ kayit, istemci, config, ben, dryRun, log, bekle = uyu, simdi = () => Date.now() }) {
    this.kayit = kayit;
    this.istemci = istemci;
    this.config = config; // ConfigOkuyucu ya da { al() }
    this.ben = ben; // { userId, kullanici }
    this.dryRun = dryRun;
    this.mod = dryRun ? "kuru" : "canli";
    this.log = log;
    this.bekle = bekle;
    this.simdi = simdi;
  }

  kendiMi(y, cfg, hesapId) {
    const benId = this.ben.userId;
    if (y.kisiId && (y.kisiId === benId || (hesapId && y.kisiId === hesapId))) return true;
    if (y.kullanici && this.ben.kullanici && katla(y.kullanici) === katla(this.ben.kullanici)) return true;
    // Son emniyet: "from" gelmese bile bizim kalıp cevabımız tekrar işlenip döngü kurmasın.
    const cevaplar = [...yorumCevaplari({}, cfg.varsayilan), ...cfg.kampanyalar.flatMap((k) => yorumCevaplari({ yorum_cevabi: k.yorum_cevabi }))].map((c) => katla(c).trim());
    return cevaplar.includes(katla(y.metin).trim());
  }

  async yorumIsle(y, { kaynak = "webhook", hesapId = null } = {}) {
    const cfg = this.config.al();
    const kisiAnahtar = kisiAnahtari(y);
    if (!this.kayit.yorumSahiplen({ ...y, kisiAnahtar }, this.mod, kaynak)) return "zaten_islendi";
    const durum = (d, ek = {}) => {
      this.kayit.yorumDurum(y.id, this.mod, d, ek);
      return d;
    };

    if (this.kendiMi(y, cfg, hesapId)) return durum("kendi");
    const bulunan = kampanyaBul(cfg.kampanyalar, y.metin, y.mediaId);
    if (!bulunan) return durum("eslesmedi");
    const k = bulunan.kampanya;
    const kim = y.kullanici ? "@" + y.kullanici : y.kisiId || "?";
    // Gönderi kimliği logda dursun: kampanyayı tek videoya bağlamak (gonderi_id) için buradan kopyalanır.
    const etiket = `${kim} "${kisa(y.metin)}" → ${k.kelime} (gönderi ${y.mediaId ?? "?"})`;

    if (y.zaman && this.simdi() - y.zaman > YEDI_GUN) {
      this.log.uyari(`${etiket}: yorum 7 günden eski, Private Reply artık gönderilemez; atlandı`);
      return durum("suresi_gecti", { kampanya: k.kelime });
    }
    const anahtarlar = kisiAnahtarlari(y);
    if (anahtarlar.some((a) => this.kayit.gonderildiMi(k.kelime, a, this.mod))) {
      this.log.bilgi(`${etiket}: bu kişiye ${k.kelime} zaten gönderilmiş; atlandı`);
      return durum("tekrar_kisi", { kampanya: k.kelime });
    }

    const devam = k.dm.length > 1 ? devamMetni(k, cfg.varsayilan) : "";
    const ilkDm = devam ? `${k.dm[0]}\n\n${devam}` : k.dm[0];
    const yorumCevabi = yorumCevabiSec(yorumCevaplari(k, cfg.varsayilan), y.id);
    const gecerlilik = Number(cfg.zamanlama.bekleyen_gecerlilik_saat) || 168;

    if (this.dryRun) {
      this.log.kuru(
        `${etiket} [${kaynak}]: GÖNDERİLMEDİ (DRY_RUN). Gidecekti → DM 1/${k.dm.length} (${bayt(ilkDm)} bayt): "${kisa(ilkDm, 80)}" · yorum cevabı: "${yorumCevabi}"` +
          (k.dm.length > 1 ? ` · kalan ${k.dm.length - 1} mesaj kişi cevap verince` : "")
      );
      for (const a of anahtarlar) this.kayit.gonderimKaydet(k.kelime, a, this.mod, y.id, null);
      if (k.dm.length > 1) {
        this.kayit.bekleyenEkle({ mod: this.mod, kampanya: k.kelime, kisiAnahtar, kimlikler: [y.kisiId], kalan: k.dm.slice(1), gecerlilikSaat: gecerlilik });
      }
      return durum("kuru", { kampanya: k.kelime });
    }

    // Önce DM: DM gitmeden herkese "DM'den gönderdim" yazmak yalan olur.
    let yanit;
    try {
      yanit = await this.istemci.ozelCevap(this.ben.userId, y.id, ilkDm);
    } catch (e) {
      this.log.hata(`${etiket}: DM gönderilemedi: ${e}${e.jetonGecersiz ? " — JETON GEÇERSİZ: yeni jeton al, .env'e yaz (KURULUM.md §4)" : ""}`);
      return durum(e.gecici ? "hata_gecici" : "hata_dm", { kampanya: k.kelime, aciklama: String(e.message).slice(0, 300) });
    }
    const igsid = yanit?.recipient_id ? String(yanit.recipient_id) : null;
    for (const a of anahtarlar) this.kayit.gonderimKaydet(k.kelime, a, this.mod, y.id, igsid);
    if (k.dm.length > 1) {
      // Devam mesajları ancak kişi cevap yazınca (24 saat penceresi) gidebilir; o ana kadar bekler.
      this.kayit.bekleyenEkle({ mod: this.mod, kampanya: k.kelime, kisiAnahtar, kimlikler: [igsid, y.kisiId], kalan: k.dm.slice(1), gecerlilikSaat: gecerlilik });
    }
    try {
      await this.istemci.yorumaCevap(y.id, yorumCevabi);
    } catch (e) {
      // DM gitti; yorum cevabı için DM'yi tekrarlamıyoruz.
      this.log.uyari(`${etiket}: DM gitti ama yorum cevabı yazılamadı: ${e}`);
      return durum("hata_yorum", { kampanya: k.kelime, aciklama: String(e.message).slice(0, 300) });
    }
    this.log.bilgi(`${etiket}: DM gönderildi${k.dm.length > 1 ? ` (1/${k.dm.length}, kalanı cevap bekliyor)` : ""} + yorum cevabı yazıldı`);
    return durum("tamam", { kampanya: k.kelime });
  }

  async mesajIsle(m) {
    if (m.echo || !m.gonderenId || m.gonderenId === this.ben.userId) return "yok_sayildi";
    this.kayit.bekleyenleriSuresiDoldur();
    const bekleyenler = this.kayit.bekleyenBul(m.gonderenId, this.mod);
    if (!bekleyenler.length) return "bekleyen_yok";
    const cfg = this.config.al();
    const ara = Number(cfg.zamanlama.mesajlar_arasi_ms) || 0;
    for (const b of bekleyenler) {
      this.kayit.bekleyenDurum(b.id, "gonderiliyor");
      const kalan = JSON.parse(b.kalan);
      let i = 0;
      try {
        for (; i < kalan.length; i++) {
          if (this.dryRun) {
            this.log.kuru(`${m.gonderenId} cevap yazdı → ${b.kampanya} devam ${i + 2}. mesaj GÖNDERİLMEDİ (DRY_RUN): "${kisa(kalan[i], 80)}"`);
          } else {
            await this.istemci.mesajGonder(this.ben.userId, m.gonderenId, kalan[i]);
          }
          if (ara && i < kalan.length - 1) await this.bekle(ara);
        }
        this.kayit.bekleyenDurum(b.id, this.dryRun ? "kuru" : "tamam");
        if (!this.dryRun) this.log.bilgi(`${m.gonderenId} cevap yazdı → ${b.kampanya} kalan ${kalan.length} mesaj gönderildi`);
      } catch (e) {
        this.kayit.bekleyenDurum(b.id, "hata");
        this.log.hata(`${b.kampanya} devam mesajı ${i + 2} gönderilemedi (${m.gonderenId}): ${e}`);
      }
    }
    return "devam_gonderildi";
  }
}
