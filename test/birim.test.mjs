import { test } from "node:test";
import assert from "node:assert/strict";
import { katla, iceriyorMu, tamMi, kampanyaBul } from "../src/eslesme.mjs";
import { imzaUret, imzaDogrula } from "../src/imza.mjs";
import { configDogrula, normalizeKampanya, yorumCevaplari, yorumCevabiSec } from "../src/ayarlar.mjs";
import { maskele, gizliEkle } from "../src/log.mjs";
import { GraphIstemci, ApiHatasi } from "../src/api.mjs";
import { JetonYonetici } from "../src/jeton.mjs";
import { Kayit } from "../src/db.mjs";
import { esanlamUret, dmBol } from "../src/kampanya.mjs";

test("Türkçe ve büyük/küçük harf katlama", () => {
  for (const s of ["LİMİT", "LIMIT", "limit", "Limit", "lımıt", "Lİmit"]) assert.equal(katla(s), "limit", s);
  assert.equal(katla("ŞĞÜÖÇ"), "sguoc");
});

test("anahtar kelime: tam kelime, noktalama ve emoji duyarsız", () => {
  assert.ok(iceriyorMu("LİMİT", "LIMIT"));
  assert.ok(iceriyorMu("limit lütfen 🙏", "LIMIT"));
  assert.ok(iceriyorMu("Hocam LIMIT!!!", "limit"));
  assert.ok(iceriyorMu("#limit", "LIMIT"));
  assert.ok(iceriyorMu("lımıt", "LİMİT"));
  assert.ok(!iceriyorMu("limitsiz kullanım", "LIMIT"), "kelime içinde geçen tetiklememeli");
  assert.ok(!iceriyorMu("", "LIMIT"));
  assert.ok(iceriyorMu("bana kurgu hattı lazım", "kurgu hatti"), "çok kelimeli ifade");
  assert.ok(tamMi("HAT 🔥", "hat"));
  assert.ok(!tamMi("bu hat çok iyi", "hat"));
});

test("kampanya seçimi: gönderiye özel önce, kapalı kampanya yok sayılır", () => {
  const ks = [
    { kelime: "LIMIT", esanlam: [], gonderi_id: null, dm: ["genel"], aktif: true },
    { kelime: "LIMIT", esanlam: [], gonderi_id: "m9", dm: ["ozel"], aktif: true },
    { kelime: "HAT", esanlam: [], gonderi_id: null, dm: ["x"], aktif: false },
  ].map(normalizeKampanya);
  assert.equal(kampanyaBul(ks, "limit", "m9").kampanya.dm[0], "ozel");
  assert.equal(kampanyaBul(ks, "limit", "m1").kampanya.dm[0], "genel");
  assert.equal(kampanyaBul(ks, "HAT", "m1"), null);
});

test("config doğrulama: 1000 bayt sınırı (devam daveti dahil), boş DM, kelime çakışması", () => {
  const uzun = "a".repeat(1001);
  let r = configDogrula({ varsayilan: { yorum_cevabi: "x" }, kampanyalar: [{ kelime: "A", dm: [uzun], aktif: false }] });
  assert.match(r.hatalar.join(), /1001 bayt/);
  r = configDogrula({ varsayilan: { yorum_cevabi: "x" }, kampanyalar: [{ kelime: "A", dm: ["ş".repeat(600)], aktif: false }] });
  assert.match(r.hatalar.join(), /1200 bayt/, "600 Türkçe harf = 1200 bayt, sınırı aşar");
  r = configDogrula({ varsayilan: { yorum_cevabi: "x", devam_daveti: "b".repeat(20) }, kampanyalar: [{ kelime: "A", dm: ["a".repeat(990), "iki"], aktif: false }] });
  assert.match(r.hatalar.join(), /devam daveti dahil/);
  r = configDogrula({ varsayilan: {}, kampanyalar: [{ kelime: "A", dm: [], aktif: true }] });
  assert.ok(r.hatalar.length >= 2);
  r = configDogrula({ varsayilan: { yorum_cevabi: "x" }, kampanyalar: [{ kelime: "LIMIT", dm: ["a"], aktif: true }, { kelime: "SINIR", esanlam: ["LİMİT"], dm: ["b"], aktif: true }] });
  assert.match(r.hatalar.join(), /iki aktif kampanyada/);
  r = configDogrula({ varsayilan: { yorum_cevabi: "x" }, kampanyalar: [{ kelime: "A", dm: ["a"], aktif: true }] });
  assert.deepEqual(r.hatalar, []);
});

test("X-Hub-Signature-256 doğrulama", () => {
  const govde = Buffer.from('{"object":"instagram"}');
  const imza = imzaUret(govde, "sir1");
  assert.ok(imzaDogrula(govde, imza, ["sir1"]));
  assert.ok(imzaDogrula(govde, imza, ["baska", "sir1"]), "ikinci secret da denenir");
  assert.ok(!imzaDogrula(govde, imza, ["baska"]));
  assert.ok(!imzaDogrula(Buffer.from('{"object":"instagram" }'), imza, ["sir1"]), "tek bayt farkı reddedilir");
  assert.ok(!imzaDogrula(govde, undefined, ["sir1"]));
  assert.ok(!imzaDogrula(govde, "sha1=abc", ["sir1"]));
});

test("log maskeleme: jeton ve secret loga girmez", () => {
  gizliEkle("SAHTE-deneme-jetonu-123456");
  assert.equal(maskele("jeton SAHTE-deneme-jetonu-123456 bitti"), "jeton *** bitti");
  assert.equal(maskele("https://x/me?access_token=abc&x=1"), "https://x/me?access_token=***&x=1");
});

function sahteFetch(yanitlar) {
  const istekler = [];
  const fn = async (url, opts) => {
    istekler.push({ url: String(url), opts });
    const y = yanitlar.shift();
    if (y instanceof Error) throw y;
    return { ok: y.status < 400, status: y.status, text: async () => JSON.stringify(y.body) };
  };
  return { fn, istekler };
}

test("API: geçici hata ve hız sınırında yeniden dener, kalıcı hatada denemez", async () => {
  const beklemeler = [];
  let f = sahteFetch([{ status: 500, body: { error: { message: "x", code: 2 } } }, { status: 400, body: { error: { message: "rate", code: 4 } } }, { status: 200, body: { recipient_id: "9", message_id: "m" } }]);
  let c = new GraphIstemci({ kok: "https://graph.instagram.com", surum: "v26.0", jeton: () => "JETON", fetchFn: f.fn, bekle: async (ms) => beklemeler.push(ms) });
  const r = await c.ozelCevap("111", "c1", "selam");
  assert.equal(r.recipient_id, "9");
  assert.equal(f.istekler.length, 3);
  assert.equal(beklemeler[0], 2000);
  assert.equal(beklemeler[1], 120000, "hız sınırında uzun bekleme");
  assert.match(f.istekler[0].url, /graph\.instagram\.com\/v26\.0\/111\/messages/);
  assert.deepEqual(JSON.parse(f.istekler[0].opts.body), { recipient: { comment_id: "c1" }, message: { text: "selam" } });

  f = sahteFetch([{ status: 400, body: { error: { message: "izin yok", code: 10 } } }]);
  c = new GraphIstemci({ kok: "https://graph.instagram.com", surum: "v26.0", jeton: () => "J", fetchFn: f.fn, bekle: async () => {} });
  await assert.rejects(c.yorumaCevap("c1", "x"), (e) => e instanceof ApiHatasi && e.kod === 10 && !e.gecici);
  assert.equal(f.istekler.length, 1);
});

test("API: yorum listesinde 'from' alanı reddedilirse username ile tekrar dener; refresh sürümsüz", async () => {
  const f = sahteFetch([{ status: 400, body: { error: { message: "nonexisting field", code: 100 } } }, { status: 200, body: { data: [{ id: "c1" }] } }, { status: 200, body: { access_token: "YENI", expires_in: 5184000 } }]);
  const c = new GraphIstemci({ kok: "https://graph.instagram.com", surum: "v26.0", jeton: () => "J", fetchFn: f.fn, bekle: async () => {}, tur: "instagram" });
  assert.deepEqual(await c.yorumlar("m1"), [{ id: "c1" }]);
  assert.match(f.istekler[1].url, /fields=id%2Ctext%2Ctimestamp%2Cusername/);
  await c.jetonYenile("ESKI");
  assert.match(f.istekler[2].url, /^https:\/\/graph\.instagram\.com\/refresh_access_token\?grant_type=ig_refresh_token&access_token=ESKI$/);
});

test("jeton: 25 saat sonra ilk yenileme, sonra 7 günde bir; .env'de yeni jeton görülünce ona geçer", async () => {
  const kayit = new Kayit(":memory:");
  let simdi = Date.UTC(2026, 10, 4);
  const yenilenen = [];
  const istemci = { jetonYenile: async (j) => (yenilenen.push(j), { access_token: "J2", expires_in: 5184000 }) };
  const j = new JetonYonetici({ envJeton: "J1-uzun-jeton", kayit, simdi: () => simdi }).baslat();
  assert.equal(await j.kontrol(istemci), false);
  simdi += 26 * 3600_000;
  assert.equal(await j.kontrol(istemci), true);
  assert.equal(j.mevcut(), "J2");
  assert.deepEqual(yenilenen, ["J1-uzun-jeton"]);
  // Yeniden başlatma: kayıtlı (yenilenmiş) jeton kullanılır
  assert.equal(new JetonYonetici({ envJeton: "J1-uzun-jeton", kayit, simdi: () => simdi }).baslat().mevcut(), "J2");
  // Hesap sahibi .env'e yeni jeton koydu
  assert.equal(new JetonYonetici({ envJeton: "J3-yeni-jeton", kayit, simdi: () => simdi }).baslat().mevcut(), "J3-yeni-jeton");
  kayit.kapat();
});

test("kampanya CLI yardımcıları: eşanlam, DM bölme", () => {
  assert.deepEqual(esanlamUret("LIMIT"), ["LİMİT", "limit"]);
  assert.deepEqual(dmBol("bir\n\n— — —\n\niki\n— — —\nüç"), ["bir", "iki", "üç"]);
});

test("Unified: IG_USER_ID varsa hesap doğrudan okunur; yoksa assigned_instagram_accounts denenir", async () => {
  const f = sahteFetch([
    { status: 200, body: { id: "17841400000000002", username: "hesabin" } },
    { status: 200, body: { data: [{ id: "1784100", username: "hesabin" }, { id: "1784200", username: "ikinci" }] } },
    { status: 200, body: { data: [] } },
  ]);
  const c = new GraphIstemci({ kok: "https://graph.facebook.com", surum: "v26.0", jeton: () => "SUAT", fetchFn: f.fn, bekle: async () => {}, tur: "unified" });
  const dogrudan = await c.ben("17841400000000002");
  assert.deepEqual([dogrudan.userId, dogrudan.kullanici], ["17841400000000002", "hesabin"]);
  assert.ok(f.istekler[0].url.startsWith("https://graph.facebook.com/v26.0/17841400000000002?fields=id%2Cusername"), f.istekler[0].url);
  const liste = await c.ben();
  assert.deepEqual([liste.userId, liste.kullanici, liste.digerHesaplar], ["1784100", "hesabin", 1]);
  assert.ok(f.istekler[1].url.includes("/v26.0/me/assigned_instagram_accounts?fields=id%2Cusername"), f.istekler[1].url);
  // Sistem kullanıcısı jetonunda hesap listesi boş dönebilir:
  await assert.rejects(c.ben(), (e) => /IG_USER_ID'yi doldur/.test(e.message) && !String(e).includes("http 0"));
  await assert.rejects(c.jetonYenile("SUAT"), /yalnız API_TURU=instagram/);
});

test("süresiz (Unified) jetonda yenileme hiç denenmez ve hata vermez", async () => {
  const kayit = new Kayit(":memory:");
  let simdi = Date.UTC(2026, 10, 4);
  let cagri = 0;
  const j = new JetonYonetici({ envJeton: "SUAT-suresiz-jeton", kayit, simdi: () => simdi, yenilenebilir: false }).baslat();
  simdi += 90 * 24 * 3600_000;
  assert.equal(await j.kontrol({ jetonYenile: async () => (cagri++, {}) }), false);
  assert.equal(cagri, 0);
  assert.equal(j.mevcut(), "SUAT-suresiz-jeton");
  kayit.kapat();
});

test("webhook ayrıştırma: Unified örneğindeki comment_id alanı da okunur", async () => {
  const { webhookCoz } = await import("../src/isleyici.mjs");
  const olaylar = webhookCoz({
    object: "instagram",
    entry: [{ id: "1784100", time: 1, changes: [{ field: "comments", value: { comment_id: "c77", text: "LIMIT", from: { id: "u1", username: "a" }, media: { id: "m1" }, parent_id: "c1" } }] }],
  });
  assert.equal(olaylar[0].yorum.id, "c77");
  assert.equal(olaylar[0].yorum.parentId, "c1");
});

test("yorum cevabı listesi: doğrulama, sabit ve dağılan seçim", () => {
  const temel = { kelime: "ORNEK", dm: ["x"], aktif: true };
  const iyi = configDogrula({ varsayilan: { yorum_cevabi: "v" }, kampanyalar: [{ ...temel, yorum_cevabi: ["A", "B", "C"] }] });
  assert.deepEqual(iyi.hatalar, []);
  assert.deepEqual(yorumCevaplari(iyi.config.kampanyalar[0], iyi.config.varsayilan), ["A", "B", "C"]);
  assert.deepEqual(yorumCevaplari({ yorum_cevabi: null }, { yorum_cevabi: "v" }), ["v"], "kampanyada yoksa varsayılan");
  const bos = configDogrula({ varsayilan: {}, kampanyalar: [{ ...temel, yorum_cevabi: ["A", " "] }] });
  assert.ok(bos.hatalar.some((h) => h.includes("boş cevap")));
  const uzun = configDogrula({ varsayilan: {}, kampanyalar: [{ ...temel, yorum_cevabi: ["A", "x".repeat(301)] }] });
  assert.ok(uzun.hatalar.some((h) => h.includes("karakteri aşıyor")));
  const c = ["A", "B", "C"];
  assert.equal(yorumCevabiSec(c, "17900000000000239"), yorumCevabiSec(c, "17900000000000239"), "aynı yorum aynı cevap");
  const goruldu = new Set(Array.from({ length: 30 }, (_, i) => yorumCevabiSec(c, `1790000000000${1000 + i}`)));
  assert.equal(goruldu.size, 3, "farklı yorumlarda üç cevap da kullanılır");
  assert.equal(yorumCevabiSec([], "1"), null);
});
