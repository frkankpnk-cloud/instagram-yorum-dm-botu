// Uçtan uca yerel akış: gerçek HTTP sunucusu + imzalı sahte webhook. Meta'ya hiçbir istek gitmez
// (Graph istemcisi sahte; KURU modda hiç çağrılmadığı da doğrulanıyor).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { imzaUret } from "../src/imza.mjs";
import { kacanlariYakala } from "../src/kacanlar.mjs";
import { ApiHatasi } from "../src/api.mjs";
import { ortamKur, sahteIstemci, yorumGovdesi, mesajGovdesi, geciciConfig, SIR, HESAP } from "./yardimci.mjs";

async function gonder(adres, govde, { sir = SIR, imza } = {}) {
  const ham = Buffer.from(JSON.stringify(govde));
  const r = await fetch(`${adres}/webhook`, { method: "POST", headers: { "X-Hub-Signature-256": imza ?? imzaUret(ham, sir) }, body: ham });
  return { durum: r.status, metin: await r.text() };
}

test("GET doğrulama: doğru verify token challenge döner, yanlışı 403", async () => {
  const o = await ortamKur();
  let r = await fetch(`${o.adres}/webhook?hub.mode=subscribe&hub.verify_token=dogrula-123&hub.challenge=987654`);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "987654");
  r = await fetch(`${o.adres}/webhook?hub.mode=subscribe&hub.verify_token=yanlis&hub.challenge=1`);
  assert.equal(r.status, 403);
  await o.kapat();
});

test("imza: geçersiz/eksik imza 403 ve işlenmez; geçerli imza hemen 200", async () => {
  const o = await ortamKur();
  assert.equal((await gonder(o.adres, yorumGovdesi(), { sir: "yanlis-secret" })).durum, 403);
  assert.equal((await gonder(o.adres, yorumGovdesi(), { imza: "" })).durum, 403);
  await o.bitir();
  assert.equal(o.kayit.yorumAl("c1", "kuru"), undefined, "imzasız istek hiç işlenmemeli");
  const r = await gonder(o.adres, yorumGovdesi());
  assert.equal(r.durum, 200);
  assert.equal(r.metin, "EVENT_RECEIVED");
  await o.kapat();
});

test("DRY_RUN: eşleşme loglanır, hiçbir API çağrısı yapılmaz", async () => {
  const o = await ortamKur({ dryRun: true });
  await gonder(o.adres, yorumGovdesi({ id: "c1", metin: "LİMİT lütfen" }));
  await gonder(o.adres, yorumGovdesi({ id: "c2", metin: "harika video", kisi: "u2" }));
  await gonder(o.adres, yorumGovdesi({ id: "c3", metin: "dosya", kisi: "u3", sarmal: false })); // changes sarmalayıcısız biçim
  await o.bitir();
  assert.equal(o.istemci.cagrilar.length, 0, "KURU modda Graph API çağrılmamalı");
  assert.equal(o.kayit.yorumAl("c1", "kuru").durum, "kuru");
  assert.equal(o.kayit.yorumAl("c1", "kuru").kampanya, "LIMIT");
  assert.equal(o.kayit.yorumAl("c2", "kuru").durum, "eslesmedi");
  assert.equal(o.kayit.yorumAl("c3", "kuru").kampanya, "DOSYA");
  assert.ok(o.log.satirlar.some((s) => s.startsWith("KURU") && s.includes("GÖNDERİLMEDİ") && s.includes("LIMIT")));
  // KURU kayıtlar CANLI tarafı etkilemez
  assert.equal(o.kayit.yorumAl("c1", "canli"), undefined);
  await o.kapat();
});

test("CANLI (sahte API): önce Private Reply DM, sonra herkese açık cevap", async () => {
  const o = await ortamKur({ dryRun: false });
  await gonder(o.adres, yorumGovdesi({ id: "c1", metin: "Limit", kisi: "u100" }));
  await o.bitir();
  assert.deepEqual(
    o.istemci.cagrilar.map((c) => c.tur),
    ["ozelCevap", "yorumaCevap"]
  );
  assert.deepEqual(o.istemci.cagrilar[0], { tur: "ozelCevap", igId: HESAP, commentId: "c1", metin: "limit dm" });
  assert.equal(o.istemci.cagrilar[1].metin, "DM'den gönderdim, mesaj isteklerine bak");
  assert.equal(o.kayit.yorumAl("c1", "canli").durum, "tamam");
  await o.kapat();
});

test("tekrar engeli: aynı yorum iki kez gelirse ve aynı kişi tekrar yazarsa ikinci DM yok", async () => {
  const o = await ortamKur({ dryRun: false });
  const g = yorumGovdesi({ id: "c1", metin: "LIMIT", kisi: "u100" });
  await Promise.all([gonder(o.adres, g), gonder(o.adres, g)]); // Meta'nın yeniden denemesi gibi
  await gonder(o.adres, yorumGovdesi({ id: "c2", metin: "limit limit", kisi: "u100" }));
  await gonder(o.adres, yorumGovdesi({ id: "c3", metin: "DOSYA", kisi: "u100" })); // başka kampanya: gider
  // Aynı kişi, kimliksiz (yalnız kullanıcı adıyla) gelirse de tanınır
  await o.isleyici.yorumIsle({ id: "c4", metin: "LIMIT", kisiId: null, kullanici: "ORNEK_KISI", mediaId: "m1" }, { kaynak: "kacanlar" });
  await o.bitir();
  const dmler = o.istemci.cagrilar.filter((c) => c.tur === "ozelCevap");
  assert.deepEqual(dmler.map((c) => c.commentId), ["c1", "c3"]);
  assert.equal(o.kayit.yorumAl("c2", "canli").durum, "tekrar_kisi");
  assert.equal(o.kayit.yorumAl("c4", "canli").durum, "tekrar_kisi", "kullanıcı adıyla gelen aynı kişi");
  await o.kapat();
});

test("döngü yok: kendi hesabın yorumu ve kendi cevabın tetiklemez", async () => {
  const o = await ortamKur({ dryRun: false });
  await gonder(o.adres, yorumGovdesi({ id: "k1", metin: "yorumlara LIMIT yaz", kisi: HESAP, kullanici: "hesabin" }));
  await gonder(o.adres, yorumGovdesi({ id: "k2", metin: "LIMIT", kisi: "baska-id", kullanici: "Hesabin" }));
  await gonder(o.adres, yorumGovdesi({ id: "k3", metin: "DM'den gönderdim, mesaj isteklerine bak", kisi: null, kullanici: null }));
  await o.bitir();
  assert.equal(o.istemci.cagrilar.length, 0);
  for (const id of ["k1", "k2", "k3"]) assert.equal(o.kayit.yorumAl(id, "canli").durum, "kendi", id);
  await o.kapat();
});

test("çok mesajlı DM (DOSYA): 1. mesaj Private Reply + davet; kalanlar kişi cevap verince", async () => {
  const o = await ortamKur({ dryRun: false });
  await gonder(o.adres, yorumGovdesi({ id: "c9", metin: "dosya", kisi: "u9" }));
  await o.bitir();
  assert.equal(o.istemci.cagrilar[0].metin, "d1\n\nKalan 2 mesaj için bir şey yaz.");
  assert.equal(o.istemci.cagrilar[1].metin, "Gönderdim, isteklere bak", "kampanyaya özel yorum cevabı");
  // Bizim gönderdiğimiz mesajın yankısı tetiklememeli
  await gonder(o.adres, mesajGovdesi({ gonderen: HESAP, echo: true }));
  // Kişi cevap yazdı (IGSID = Private Reply yanıtındaki recipient_id)
  await gonder(o.adres, mesajGovdesi({ gonderen: "igsid-c9", metin: "tamam" }));
  await o.bitir();
  const devam = o.istemci.cagrilar.filter((c) => c.tur === "mesajGonder");
  assert.deepEqual(devam.map((c) => [c.igsid, c.metin]), [["igsid-c9", "d2"], ["igsid-c9", "d3"]]);
  // İkinci cevap tekrar göndermez
  await gonder(o.adres, mesajGovdesi({ gonderen: "igsid-c9", metin: "teşekkürler" }));
  await o.bitir();
  assert.equal(o.istemci.cagrilar.filter((c) => c.tur === "mesajGonder").length, 2);
  await o.kapat();
});

test("DM hatası: herkese açık cevap yazılmaz; geçici hata sonra yeniden denenebilir", async () => {
  const istemci = sahteIstemci({ dmHatasi: new ApiHatasi({ mesaj: "sunucu", http: 500, gecici: true }) });
  const o = await ortamKur({ dryRun: false, istemci });
  await gonder(o.adres, yorumGovdesi({ id: "c5", metin: "LIMIT", kisi: "u5" }));
  await o.bitir();
  assert.deepEqual(istemci.cagrilar.map((c) => c.tur), ["ozelCevap"]);
  assert.equal(o.kayit.yorumAl("c5", "canli").durum, "hata_gecici");
  assert.equal(o.kayit.yorumGoruldu("c5", "canli"), false, "kaçanları yakala tekrar deneyebilmeli");
  await o.kapat();
});

test("config.json kod değişmeden düzenlenir: kampanya açılınca bot hemen görür", async () => {
  const cfg = geciciConfig();
  const o = await ortamKur({ dryRun: false, config: cfg });
  await gonder(o.adres, yorumGovdesi({ id: "h1", metin: "HAT", kisi: "u1" }));
  await o.bitir();
  assert.equal(o.kayit.yorumAl("h1", "canli").durum, "eslesmedi", "HAT kapalıyken");
  const ham = JSON.parse(fs.readFileSync(cfg.yol, "utf8"));
  ham.kampanyalar[2].aktif = true;
  await new Promise((r) => setTimeout(r, 30)); // mtime değişsin
  fs.writeFileSync(cfg.yol, JSON.stringify(ham));
  await gonder(o.adres, yorumGovdesi({ id: "h2", metin: "hat", kisi: "u2" }));
  await o.bitir();
  assert.equal(o.kayit.yorumAl("h2", "canli").durum, "tamam");
  await o.kapat();
});

test("kaçanları yakala: ilk açılışta yalnız işaretler, sonraki açılışta yeni yorumları işler", async () => {
  const o = await ortamKur({ dryRun: false });
  const simdi = Date.now();
  const ts = (saatOnce) => new Date(simdi - saatOnce * 3600_000).toISOString();
  o.istemci.medyaListesi = [{ id: "m1" }];
  o.istemci.yorumListesi.m1 = [
    { id: "eski1", text: "LIMIT", timestamp: ts(5), from: { id: "a1", username: "a" } },
    { id: "cok-eski", text: "LIMIT", timestamp: ts(200), from: { id: "a2", username: "b" } },
  ];
  const bag = { istemci: o.istemci, kayit: o.kayit, isleyici: o.isleyici, config: o.okuyucu, ben: { userId: HESAP }, log: o.log };
  let r = await kacanlariYakala(bag);
  assert.equal(r.isaretlenen, 1, "72 saatten eski olan taranmaz bile");
  assert.equal(o.istemci.cagrilar.length, 0, "ilk açılışta (eski yorumlar) DM gitmez");
  // Bot kapalıyken iki yeni yorum geldi; biri webhook'la zaten işlenmişti
  o.istemci.yorumListesi.m1.push({ id: "yeni1", text: "lütfen limit", timestamp: ts(1), username: "c" });
  o.istemci.yorumListesi.m1.push({ id: "yeni2", text: "süper", timestamp: ts(1), from: { id: "a4", username: "d" } });
  r = await kacanlariYakala(bag);
  assert.equal(r.islenen, 1);
  assert.deepEqual(o.istemci.cagrilar.filter((c) => c.tur === "ozelCevap").map((c) => c.commentId), ["yeni1"]);
  await o.kapat();
});

test("KURULUM modu (jeton/secret yok): GET doğrulama geçer, POST 200 alır ama hiçbir şey işlenmez", async () => {
  const { sunucuOlustur } = await import("../src/sunucu.mjs");
  const { Kuyruk } = await import("../src/kuyruk.mjs");
  const { bellekLog } = await import("../src/log.mjs");
  const log = bellekLog();
  const kur = async (imzaSirlari) => {
    const s = sunucuOlustur({ ayar: { dryRun: true, dogrulamaJetonu: "dogrula-123", imzaSirlari, hamLog: false }, isleyici: null, kuyruk: new Kuyruk(log), log });
    await new Promise((r) => s.listen(0, "127.0.0.1", r));
    return { s, adres: `http://127.0.0.1:${s.address().port}` };
  };
  const a = await kur([]);
  let r = await fetch(`${a.adres}/webhook?hub.mode=subscribe&hub.verify_token=dogrula-123&hub.challenge=55`);
  assert.equal(await r.text(), "55");
  assert.equal((await gonder(a.adres, yorumGovdesi())).durum, 200);
  assert.ok(log.satirlar.some((l) => l.includes("İŞLENMEDİ")));
  assert.equal(JSON.parse(await (await fetch(`${a.adres}/saglik`)).text()).mod, "kurulum");
  await new Promise((x) => a.s.close(x));
  // Secret var, jeton yok: imza yine kontrol edilir
  const b = await kur([SIR]);
  assert.equal((await gonder(b.adres, yorumGovdesi(), { sir: "yanlis" })).durum, 403);
  assert.equal((await gonder(b.adres, yorumGovdesi())).durum, 200);
  assert.ok(log.satirlar.some((l) => l.includes("KURULUM MODU: imzası doğru webhook alındı")));
  await new Promise((x) => b.s.close(x));
});
