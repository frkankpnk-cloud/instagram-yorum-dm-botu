// Okunabilir log: konsola ve logs/bot-YYYY-AA-GG.log dosyasına aynı satır.
// Erişim jetonu ve app secret hiçbir log satırına girmesin diye her satır maskeden geçer.
import fs from "node:fs";
import path from "node:path";

const gizliler = new Set();

export function gizliEkle(deger) {
  if (deger && String(deger).length >= 8) gizliler.add(String(deger));
}

export function maskele(metin) {
  let s = String(metin);
  for (const g of gizliler) s = s.split(g).join("***");
  // URL'ye karışmış herhangi bir jeton da maskelensin.
  return s.replace(/(access_token=|client_secret=)[^&\s"]+/gi, "$1***");
}

function saat() {
  // İstanbul saatiyle okunur; logu UTC'ye çevirmek zorunda kalmazsın.
  return new Date().toLocaleString("sv-SE", { timeZone: "Europe/Istanbul" });
}

export function logOlustur({ klasor, sessiz = false, onek = "" } = {}) {
  if (klasor) fs.mkdirSync(klasor, { recursive: true });
  const yaz = (seviye, mesaj) => {
    const satir = `${saat()} ${seviye.padEnd(5)} ${onek}${maskele(mesaj)}`;
    if (!sessiz) (seviye === "HATA" ? console.error : console.log)(satir);
    if (klasor) {
      const gun = saat().slice(0, 10);
      try {
        fs.appendFileSync(path.join(klasor, `bot-${gun}.log`), satir + "\n", "utf8");
      } catch {
        /* disk dolu vb.: konsol yine de yazdı */
      }
    }
    return satir;
  };
  return {
    bilgi: (m) => yaz("BILGI", m),
    uyari: (m) => yaz("UYARI", m),
    hata: (m) => yaz("HATA", m),
    kuru: (m) => yaz("KURU", m),
  };
}

// Testlerde log satırlarını toplamak için.
export function bellekLog() {
  const satirlar = [];
  const yaz = (s) => (m) => satirlar.push(`${s} ${maskele(m)}`);
  return { satirlar, bilgi: yaz("BILGI"), uyari: yaz("UYARI"), hata: yaz("HATA"), kuru: yaz("KURU") };
}
