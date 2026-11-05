#!/usr/bin/env node
// Yerel test: çalışan bota Meta'nın göndereceği biçimde İMZALI sahte webhook yollar.
// Meta'ya ya da Instagram'a hiçbir şey gitmez; yalnız 127.0.0.1'deki bot.
//
//   npm run sahte -- --metin "LİMİT lütfen"                  (yorum olayı)
//   npm run sahte -- --metin "tamam" --mesaj --kisi 900001    (DM cevabı olayı: çok mesajlı kampanyanın devamı)
//   npm run sahte -- --metin "LIMIT" --imza bozuk             (imza reddi testi, 403 beklenir)
import crypto from "node:crypto";
import { envYukle, ortamAyarlari } from "./ayarlar.mjs";
import { imzaUret } from "./imza.mjs";

envYukle();
const ayar = ortamAyarlari();
const a = process.argv.slice(2);
const al = (ad, varsayilan) => {
  const i = a.indexOf(`--${ad}`);
  if (i < 0) return varsayilan;
  const d = a[i + 1];
  return d === undefined || d.startsWith("--") ? true : d;
};

const hesap = al("hesap", ayar.igKullaniciId || "17840000000000000");
const kisi = String(al("kisi", "900001"));
const zaman = Math.floor(Date.now() / 1000);
const govde = al("mesaj", false)
  ? {
      object: "instagram",
      entry: [{ id: hesap, time: zaman, messaging: [{ sender: { id: kisi }, recipient: { id: hesap }, timestamp: Date.now(), message: { mid: "sahte-" + crypto.randomUUID(), text: String(al("metin", "tamam")) } }] }],
    }
  : {
      object: "instagram",
      entry: [
        {
          id: hesap,
          time: zaman,
          changes: [
            {
              field: "comments",
              value: {
                id: String(al("yorum", "sahte-" + Date.now())),
                text: String(al("metin", "LIMIT")),
                from: { id: kisi, username: String(al("kullanici", "deneme_kisi")) },
                media: { id: String(al("gonderi", "18000000000000001")), media_product_type: "REELS" },
              },
            },
          ],
        },
      ],
    };

const ham = Buffer.from(JSON.stringify(govde));
const sir = al("sir", ayar.imzaSirlari[0]);
if (!sir) {
  console.error("İmza için IG_APP_SECRET gerekli (.env) ya da --sir verin");
  process.exit(1);
}
const imza = al("imza") === "bozuk" ? "sha256=" + "0".repeat(64) : imzaUret(ham, sir);
const url = al("url", `http://127.0.0.1:${ayar.port}/webhook`);

const yanit = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-Hub-Signature-256": imza }, body: ham });
console.log(`${yanit.status} ${await yanit.text()} — sonucu botun konsolunda / logs/ klasöründe gör`);
