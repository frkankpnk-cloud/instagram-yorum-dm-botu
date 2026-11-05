#!/usr/bin/env node
// Kampanya yönetimi (config.json'u elle açmadan). Yeni kampanyayı komut satırından ekler, açar, kapatır ya da siler.
//
//   node src/kampanya.mjs listele
//   node src/kampanya.mjs ekle --kelime LIMIT --dm-dosya dm.txt [--ayrac "— — —"] [--yorum "..."] [--gonderi ID] [--aktif]
//   node src/kampanya.mjs ekle --kelime HAT --dm "1. mesaj" --dm "2. mesaj" [--eslesme tam]
//   node src/kampanya.mjs ac|kapat|sil --kelime LIMIT
//   node src/kampanya.mjs dogrula
//
// Yeni kampanya varsayılan olarak aktif:false açılır; metni kontrol edince "ac" ile açarsın.
// Çalışan bot config.json değişikliğini kendisi görür, yeniden başlatmak gerekmez.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KOK, configDogrula, normalizeKampanya, DM_SINIR, devamMetni, bayt } from "./ayarlar.mjs";
import { katla } from "./eslesme.mjs";

export const DM_AYRAC = /^\s*—\s*—\s*—\s*$/m; // --dm-dosya metninde mesajları ayıran satır

function argumanlariAyir(argv) {
  const [komut, ...geri] = argv;
  const secenek = { _: [] };
  for (let i = 0; i < geri.length; i++) {
    const a = geri[i];
    if (!a.startsWith("--")) {
      secenek._.push(a);
      continue;
    }
    const ad = a.slice(2);
    const sonraki = geri[i + 1];
    const deger = sonraki === undefined || sonraki.startsWith("--") ? true : (i++, sonraki);
    if (secenek[ad] === undefined) secenek[ad] = deger;
    else secenek[ad] = [].concat(secenek[ad], deger);
  }
  return { komut, secenek };
}

export function esanlamUret(kelime) {
  // Eşleşme zaten harf/Türkçe karakter duyarsız; bu liste yalnız config.json'da okunurluk için.
  const kucuk = kelime.toLowerCase();
  return [...new Set([kucuk.toLocaleUpperCase("tr"), kucuk])].filter((e) => e !== kelime);
}

export function dmBol(metin, ayrac = DM_AYRAC) {
  const parca = typeof ayrac === "string" ? metin.split(ayrac) : metin.split(ayrac);
  return parca.map((p) => p.trim()).filter(Boolean);
}

export function configOku(yol) {
  if (!fs.existsSync(yol)) throw new Error(`config.json bulunamadı: ${yol}. config.example.json'u config.json olarak kopyala (KURULUM.md).`);
  return JSON.parse(fs.readFileSync(yol, "utf8").replace(/^﻿/, ""));
}

export function configYaz(yol, ham) {
  const { hatalar } = configDogrula(ham);
  if (hatalar.length) throw new Error("config.json yazılmadı, hatalar var:\n  - " + hatalar.join("\n  - "));
  // Önce geçici dosya, sonra yeniden adlandırma: çalışan bot yarım yazılmış dosya okumasın.
  const gecici = yol + ".yeni";
  fs.writeFileSync(gecici, JSON.stringify(ham, null, 2) + "\n", "utf8");
  fs.renameSync(gecici, yol);
}

function bul(ham, kelime) {
  return (ham.kampanyalar || []).findIndex((k) => katla(k.kelime) === katla(kelime));
}

export function kampanyaEkle(ham, yeni, { uzerineYaz = false } = {}) {
  ham.kampanyalar = ham.kampanyalar || [];
  const i = bul(ham, yeni.kelime);
  if (i >= 0 && !uzerineYaz) throw new Error(`"${yeni.kelime}" kampanyası zaten var. Değiştirmek için --uzerine-yaz ekle.`);
  if (i >= 0) ham.kampanyalar[i] = { ...ham.kampanyalar[i], ...yeni };
  else ham.kampanyalar.push(yeni);
  return ham;
}

function ozetSatir(k) {
  const n = normalizeKampanya(k);
  const yer = n.gonderi_id === null ? "tüm gönderiler" : `gönderi ${[].concat(n.gonderi_id).join(",")}`;
  return `${n.aktif ? "AÇIK " : "kapalı"} ${n.kelime.padEnd(8)} ${n.dm.length} mesaj · ${yer}`;
}

export function calistir(argv, { yaz = console.log } = {}) {
  const { komut, secenek } = argumanlariAyir(argv);
  const yol = path.resolve(secenek.config || process.env.CONFIG_YOLU || path.join(KOK, "config.json"));
  const ham = configOku(yol);

  const yeniKampanya = (temel) => {
    const k = { ...temel };
    if (secenek.esanlam) k.esanlam = String(secenek.esanlam).split(",").map((s) => s.trim()).filter(Boolean);
    if (secenek.gonderi) k.gonderi_id = String(secenek.gonderi);
    else if (k.gonderi_id === undefined) k.gonderi_id = null;
    // Birden çok cevap "||" ile ayrılır: --yorum "Gönderdim || DM'ine bak || Attım" (dönüşümlü kullanılır).
    if (secenek.yorum) {
      const parca = String(secenek.yorum).split("||").map((c) => c.trim()).filter(Boolean);
      k.yorum_cevabi = parca.length > 1 ? parca : parca[0];
    }
    if (secenek.devam) k.devam_daveti = String(secenek.devam);
    if (secenek.eslesme) k.eslesme = String(secenek.eslesme);
    k.aktif = secenek.aktif === true;
    return {
      kelime: k.kelime,
      esanlam: k.esanlam ?? esanlamUret(k.kelime),
      gonderi_id: k.gonderi_id,
      yorum_cevabi: k.yorum_cevabi ?? null,
      dm: k.dm,
      ...(k.devam_daveti ? { devam_daveti: k.devam_daveti } : {}),
      eslesme: k.eslesme ?? "icerir",
      aktif: k.aktif,
    };
  };

  const kontrolYaz = (k) => {
    const n = normalizeKampanya(k);
    const devam = n.dm.length > 1 ? devamMetni(n, ham.varsayilan) : "";
    n.dm.forEach((m, i) => {
      const uz = bayt(i === 0 && devam ? `${m}\n\n${devam}` : m);
      yaz(`  ${i + 1}. mesaj: ${uz}/${DM_SINIR} bayt`);
    });
  };

  switch (komut) {
    case "listele": {
      const ks = ham.kampanyalar || [];
      yaz(ks.length ? ks.map(ozetSatir).join("\n") : "Kampanya yok");
      return 0;
    }
    case "dogrula": {
      const { hatalar } = configDogrula(ham);
      yaz(hatalar.length ? "HATALAR:\n  - " + hatalar.join("\n  - ") : "config.json geçerli");
      return hatalar.length ? 1 : 0;
    }
    case "ekle": {
      if (!secenek.kelime || secenek.kelime === true) throw new Error("--kelime gerekli");
      let dm = [];
      if (secenek["dm-dosya"]) {
        const metin = fs.readFileSync(path.resolve(String(secenek["dm-dosya"])), "utf8").replace(/^﻿/, "");
        dm = dmBol(metin, secenek.ayrac ? String(secenek.ayrac) : DM_AYRAC);
      }
      if (secenek.dm) dm = dm.concat([].concat(secenek.dm).map(String));
      if (!dm.length) throw new Error("--dm-dosya ya da en az bir --dm gerekli");
      const k = yeniKampanya({ kelime: String(secenek.kelime).trim(), dm });
      configYaz(yol, kampanyaEkle(ham, k, { uzerineYaz: secenek["uzerine-yaz"] === true }));
      yaz(`Eklendi: ${ozetSatir(k)}`);
      kontrolYaz(k);
      return 0;
    }
    case "ac":
    case "kapat":
    case "sil": {
      if (!secenek.kelime || secenek.kelime === true) throw new Error("--kelime gerekli");
      const i = bul(ham, String(secenek.kelime));
      if (i < 0) throw new Error(`"${secenek.kelime}" kampanyası yok`);
      if (komut === "sil") ham.kampanyalar.splice(i, 1);
      else ham.kampanyalar[i].aktif = komut === "ac";
      configYaz(yol, ham);
      yaz(komut === "sil" ? `Silindi: ${secenek.kelime}` : ozetSatir(ham.kampanyalar[i]));
      return 0;
    }
    default:
      yaz(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").filter((s) => s.startsWith("//")).slice(0, 10).map((s) => s.replace(/^\/\/ ?/, "")).join("\n"));
      return komut ? 1 : 0;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = calistir(process.argv.slice(2));
  } catch (e) {
    console.error(`HATA: ${e.message}`);
    process.exitCode = 1;
  }
}
