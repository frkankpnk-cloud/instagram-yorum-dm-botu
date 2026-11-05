// Ortam değişkenleri ve config.json okuma/doğrulama.
// .env dosyasını süreç kendisi yükler (process.loadEnvFile); kod onu asla ekrana basmaz.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Meta: "Message text must be UTF-8 and be a 1000 bytes or less" (messaging-api). Karakter değil BAYT:
// Türkçe harf 2, emoji 4 bayt sayılır; 1000 karakterlik Türkçe metin sınırı aşar.
export const DM_SINIR = 1000;
export const bayt = (s) => Buffer.byteLength(String(s), "utf8");
export const YORUM_SINIR = 300; // herkese açık cevap kısa kalsın diye bizim sınırımız

// ENV_DOSYASI yalnız testler için (gerçek .env yerine deneme dosyası); normalde boş.
export const envDosyasi = () => process.env.ENV_DOSYASI || path.join(KOK, ".env");

export function envYukle(dosya = envDosyasi()) {
  // Görev Zamanlayıcı'dan açılınca çalışma klasörü farklı olabilir; bu yüzden tam yol.
  if (fs.existsSync(dosya) && typeof process.loadEnvFile === "function") {
    process.loadEnvFile(dosya);
  }
}

function dogruMu(deger, varsayilan) {
  if (deger === undefined || deger === "") return varsayilan;
  return !["false", "0", "hayir", "hayır", "no", "off"].includes(String(deger).trim().toLowerCase());
}

// İki Meta kurulumu var. Yeni uygulamalarda Meta paneli yalnız "Unified login" sunuyor (Kasım 2026):
// çağrılar graph.facebook.com'a, jeton süresiz sistem kullanıcısı jetonu (SUAT). Eski "Instagram login"
// kurulumu graph.instagram.com ve 60 günlük, yenilenen jetonla çalışır. Varsayılan unified.
export const API_TURLERI = ["unified", "instagram"];

export function ortamAyarlari(env = process.env) {
  const apiTuru = String(env.API_TURU || "unified").trim().toLowerCase();
  return {
    port: Number(env.PORT || 8787),
    dryRun: dogruMu(env.DRY_RUN, true), // varsayılan KURU: sen açıkça false yazmadan hiçbir şey gönderilmez
    dogrulamaJetonu: env.WEBHOOK_VERIFY_TOKEN || "",
    // İmza "your app's App Secret" ile atılıyor; Unified'da Meta app secret kullanılır. Hangisi olduğu
    // dokümanda açık yazmadığı için ikisi de kabul edilir (KURULUM §12).
    imzaSirlari: [env.META_APP_SECRET, env.IG_APP_SECRET].filter(Boolean),
    erisimJetonu: env.IG_ACCESS_TOKEN || "",
    igKullaniciId: env.IG_USER_ID || "",
    apiTuru: API_TURLERI.includes(apiTuru) ? apiTuru : "unified",
    apiTuruHam: apiTuru,
    apiSurum: env.GRAPH_API_VERSION || "v26.0",
    apiKok: env.GRAPH_API_HOST || (apiTuru === "instagram" ? "https://graph.instagram.com" : "https://graph.facebook.com"),
    envYolu: env.ENV_DOSYASI || path.join(KOK, ".env"),
    bekciAltinda: env.BOT_BEKCI === "1",
    configYolu: env.CONFIG_YOLU || path.join(KOK, "config.json"),
    dbYolu: env.DB_YOLU || path.join(KOK, "data", "bot.sqlite"),
    logKlasoru: env.LOG_KLASORU || path.join(KOK, "logs"),
    hamLog: dogruMu(env.LOG_HAM, false),
    ngrokUrl: env.NGROK_URL || "",
    ngrokYolu: env.NGROK_YOLU || "ngrok",
  };
}

// Yorum cevabı tek metin ya da liste olabilir. Liste verilirse cevaplar dönüşümlü kullanılır: aynı cümleyi
// yüzlerce yoruma yazmak Instagram'da spam gibi görünür, bu yüzden liste destekleniyor.
export function yorumCevaplari(k, varsayilan = {}) {
  const ham = k?.yorum_cevabi ?? varsayilan?.yorum_cevabi ?? null;
  const liste = Array.isArray(ham) ? ham : ham == null ? [] : [ham];
  return liste.map((c) => String(c).trim()).filter(Boolean);
}

// Seçim yorum kimliğine göre sabit: aynı yorum yeniden işlenirse (kaçanlar, tekrar deneme) aynı cevap çıkar.
export function yorumCevabiSec(cevaplar, anahtar = "") {
  if (!cevaplar.length) return null;
  let h = 0;
  for (const ch of String(anahtar)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return cevaplar[h % cevaplar.length];
}

export function normalizeKampanya(k) {
  const esanlam = Array.isArray(k.esanlam) ? k.esanlam : k.esanlam ? [k.esanlam] : [];
  let gonderi = k.gonderi_id ?? null;
  if (Array.isArray(gonderi) && gonderi.length === 0) gonderi = null;
  const dm = Array.isArray(k.dm) ? k.dm : k.dm ? [k.dm] : [];
  return {
    kelime: String(k.kelime ?? "").trim(),
    esanlam: esanlam.map((e) => String(e).trim()).filter(Boolean),
    gonderi_id: gonderi === null ? null : Array.isArray(gonderi) ? gonderi.map(String) : String(gonderi),
    yorum_cevabi: k.yorum_cevabi == null ? null : Array.isArray(k.yorum_cevabi) ? k.yorum_cevabi.map(String) : String(k.yorum_cevabi),
    dm: dm.map((m) => String(m)),
    devam_daveti: k.devam_daveti ?? null,
    // "icerir": kelime yorumun herhangi bir yerinde geçerse; "tam": yorum yalnız o kelimeden ibaretse.
    eslesme: k.eslesme ?? "icerir",
    aktif: k.aktif === true,
    not: k.not ?? null,
  };
}

// Hatalı config'i sessizce kabul etmek yanlış kişiye yanlış DM demek; bu yüzden sert doğrulama.
export function configDogrula(ham) {
  const hatalar = [];
  if (!ham || typeof ham !== "object") return { hatalar: ["config.json bir nesne olmalı"] };
  const varsayilan = ham.varsayilan || {};
  const kampanyalar = (ham.kampanyalar || []).map(normalizeKampanya);
  const gorulen = new Map();
  kampanyalar.forEach((k, i) => {
    const ad = k.kelime || `#${i + 1}`;
    if (!k.kelime) hatalar.push(`Kampanya ${ad}: "kelime" boş`);
    if (!["icerir", "tam"].includes(k.eslesme)) hatalar.push(`Kampanya ${ad}: "eslesme" yalnız "icerir" ya da "tam" olabilir`);
    if (k.dm.length === 0) hatalar.push(`Kampanya ${ad}: "dm" en az bir mesaj olmalı`);
    k.dm.forEach((m, j) => {
      const devam = j === 0 && k.dm.length > 1 ? devamMetni(k, varsayilan) : "";
      const uzunluk = bayt(m + (devam ? "\n\n" + devam : ""));
      if (!m.trim()) hatalar.push(`Kampanya ${ad}: ${j + 1}. DM boş`);
      if (uzunluk > DM_SINIR) hatalar.push(`Kampanya ${ad}: ${j + 1}. DM ${uzunluk} bayt (Meta sınırı ${DM_SINIR} bayt; Türkçe harf 2 bayt${devam ? ", devam daveti dahil" : ""})`);
    });
    const yorumlar = yorumCevaplari(k, varsayilan);
    if (Array.isArray(k.yorum_cevabi) && k.yorum_cevabi.some((c) => !String(c).trim())) hatalar.push(`Kampanya ${ad}: yorum_cevabi listesinde boş cevap var`);
    if (!yorumlar.length) hatalar.push(`Kampanya ${ad}: yorum_cevabi yok (varsayilan.yorum_cevabi da boş)`);
    for (const y of yorumlar) if ([...y].length > YORUM_SINIR) hatalar.push(`Kampanya ${ad}: yorum cevabı ${YORUM_SINIR} karakteri aşıyor ("${y.slice(0, 30)}…")`);
    if (!k.aktif) return;
    // Aynı gönderide iki aktif kampanya aynı kelimeyi dinlerse hangisinin çalışacağı belirsiz olur.
    for (const kelime of [k.kelime, ...k.esanlam]) {
      const anahtar = `${ortakAnahtar(kelime)}|${k.gonderi_id === null ? "*" : [].concat(k.gonderi_id).join(",")}`;
      if (gorulen.has(anahtar) && gorulen.get(anahtar) !== k.kelime) {
        hatalar.push(`"${kelime}" kelimesi aynı gönderi kapsamında iki aktif kampanyada var (${gorulen.get(anahtar)}, ${k.kelime})`);
      }
      gorulen.set(anahtar, k.kelime);
    }
  });
  const kacanlar = {
    aktif: true,
    son_gonderi_sayisi: 10,
    en_eski_saat: 72,
    ilk_acilista_yalniz_isaretle: true,
    ...(ham.kacanlar || {}),
  };
  const zamanlama = {
    mesajlar_arasi_ms: 1500,
    bekleyen_gecerlilik_saat: 168,
    ...(ham.zamanlama || {}),
  };
  return { hatalar, config: { varsayilan, kampanyalar, kacanlar, zamanlama } };
}

export function devamMetni(kampanya, varsayilan = {}) {
  const sablon = kampanya.devam_daveti ?? varsayilan.devam_daveti ?? "";
  return String(sablon).replaceAll("{kalan}", String(Math.max(0, kampanya.dm.length - 1)));
}

// eslesme.mjs'e döngüsel bağımlılık olmasın diye burada küçük bir kopya: yalnız çakışma kontrolü için.
function ortakAnahtar(s) {
  return String(s).replace(/[İIı]/g, "i").toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").trim();
}

export class ConfigOkuyucu {
  // Bot her olayda config'i yeniden okumaz; dosya değiştiyse okur. Sen botu durdurmadan config.json'u düzenleyebilirsin.
  constructor(yol, log) {
    this.yol = yol;
    this.log = log;
    this.mtime = 0;
    this.son = null;
  }
  al() {
    let stat;
    try {
      stat = fs.statSync(this.yol);
    } catch {
      throw new Error(`config.json bulunamadı: ${this.yol}. config.example.json'u config.json olarak kopyala ve kampanyalarını yaz (KURULUM.md).`);
    }
    if (this.son && stat.mtimeMs === this.mtime) return this.son;
    let ham;
    try {
      ham = JSON.parse(fs.readFileSync(this.yol, "utf8").replace(/^﻿/, ""));
    } catch (e) {
      if (this.son) {
        this.log?.hata(`config.json okunamadı (${e.message}); son geçerli sürümle devam ediliyor`);
        this.mtime = stat.mtimeMs;
        return this.son;
      }
      throw new Error(`config.json geçerli JSON değil: ${e.message}`);
    }
    const { hatalar, config } = configDogrula(ham);
    if (hatalar.length) {
      const mesaj = "config.json hataları:\n  - " + hatalar.join("\n  - ");
      if (this.son) {
        this.log?.hata(mesaj + "\n  Son geçerli sürümle devam ediliyor.");
        this.mtime = stat.mtimeMs;
        return this.son;
      }
      throw new Error(mesaj);
    }
    if (this.son) this.log?.bilgi(`config.json yeniden yüklendi (${config.kampanyalar.filter((k) => k.aktif).length} aktif kampanya)`);
    this.mtime = stat.mtimeMs;
    this.son = config;
    return config;
  }
}
