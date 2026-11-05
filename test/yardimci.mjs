// Testler için ortak parçalar: geçici config, sahte Graph istemcisi, sunucu kurulumu.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ConfigOkuyucu } from "../src/ayarlar.mjs";
import { Kayit } from "../src/db.mjs";
import { Isleyici } from "../src/isleyici.mjs";
import { Kuyruk } from "../src/kuyruk.mjs";
import { sunucuOlustur } from "../src/sunucu.mjs";
import { bellekLog } from "../src/log.mjs";

export const SIR = "test-app-secret-1234567890";
export const HESAP = "17841400000000001";

export function geciciConfig(degisiklik = {}) {
  const klasor = fs.mkdtempSync(path.join(os.tmpdir(), "igoto-"));
  const ham = {
    varsayilan: { yorum_cevabi: "DM'den gönderdim, mesaj isteklerine bak", devam_daveti: "Kalan {kalan} mesaj için bir şey yaz." },
    kacanlar: { aktif: true, son_gonderi_sayisi: 5, en_eski_saat: 72, ilk_acilista_yalniz_isaretle: true },
    zamanlama: { mesajlar_arasi_ms: 0, bekleyen_gecerlilik_saat: 168 },
    kampanyalar: [
      { kelime: "LIMIT", esanlam: ["LİMİT", "limit"], gonderi_id: null, yorum_cevabi: null, dm: ["limit dm"], aktif: true },
      { kelime: "DOSYA", esanlam: ["dosya"], gonderi_id: null, yorum_cevabi: "Gönderdim, isteklere bak", dm: ["d1", "d2", "d3"], aktif: true },
      { kelime: "HAT", esanlam: [], gonderi_id: null, yorum_cevabi: null, dm: ["hat dm"], aktif: false },
    ],
    ...degisiklik,
  };
  const yol = path.join(klasor, "config.json");
  fs.writeFileSync(yol, JSON.stringify(ham, null, 2));
  return { klasor, yol };
}

export function sahteIstemci({ dmHatasi = null } = {}) {
  const cagrilar = [];
  let sayac = 0;
  return {
    cagrilar,
    async ozelCevap(igId, commentId, metin) {
      cagrilar.push({ tur: "ozelCevap", igId, commentId, metin });
      if (dmHatasi) throw dmHatasi;
      return { recipient_id: "igsid-" + commentId, message_id: "m" + ++sayac };
    },
    async mesajGonder(igId, igsid, metin) {
      cagrilar.push({ tur: "mesajGonder", igId, igsid, metin });
      return { recipient_id: igsid, message_id: "m" + ++sayac };
    },
    async yorumaCevap(commentId, metin) {
      cagrilar.push({ tur: "yorumaCevap", commentId, metin });
      return { id: "r" + ++sayac };
    },
    medyaListesi: [],
    yorumListesi: {},
    async medyalar() {
      return this.medyaListesi;
    },
    async yorumlar(mediaId) {
      return this.yorumListesi[mediaId] ?? [];
    },
  };
}

export async function ortamKur({ dryRun = true, istemci = sahteIstemci(), config } = {}) {
  const { yol } = config ?? geciciConfig();
  const log = bellekLog();
  const kayit = new Kayit(":memory:");
  const okuyucu = new ConfigOkuyucu(yol, log);
  okuyucu.al();
  const kuyruk = new Kuyruk(log);
  const isleyici = new Isleyici({ kayit, istemci, config: okuyucu, ben: { userId: HESAP, kullanici: "hesabin" }, dryRun, log, bekle: async () => {} });
  const ayar = { dryRun, dogrulamaJetonu: "dogrula-123", imzaSirlari: [SIR], hamLog: false };
  const sunucu = sunucuOlustur({ ayar, isleyici, kuyruk, log });
  await new Promise((r) => sunucu.listen(0, "127.0.0.1", r));
  const adres = `http://127.0.0.1:${sunucu.address().port}`;
  return {
    adres, kayit, kuyruk, isleyici, istemci, log, okuyucu, configYolu: yol,
    async kapat() {
      await new Promise((r) => sunucu.close(r));
      kayit.kapat();
    },
    async bitir() {
      await new Promise((r) => setTimeout(r, 20));
      await kuyruk.bosalinca();
    },
  };
}

export function yorumGovdesi({ id = "c1", metin = "LIMIT", kisi = "u100", kullanici = "ornek_kisi", media = "m1", sarmal = true } = {}) {
  const value = { id, text: metin, from: { id: kisi, username: kullanici }, media: { id: media, media_product_type: "REELS" } };
  const entry = sarmal
    ? { id: HESAP, time: Math.floor(Date.now() / 1000), changes: [{ field: "comments", value }] }
    : { id: HESAP, time: Math.floor(Date.now() / 1000), field: "comments", value };
  return { object: "instagram", entry: [entry] };
}

export function mesajGovdesi({ gonderen = "igsid-c1", metin = "tamam", echo = false } = {}) {
  return {
    object: "instagram",
    entry: [{ id: HESAP, time: Date.now(), messaging: [{ sender: { id: gonderen }, recipient: { id: HESAP }, timestamp: Date.now(), message: { mid: "mid1", text: metin, ...(echo ? { is_echo: true } : {}) } }] }],
  };
}
