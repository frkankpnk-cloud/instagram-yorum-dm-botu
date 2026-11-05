// Meta Instagram API istemcisi. Yalnız resmî uç noktalar; kaynaklar KURULUM.md §13'te.
//   unified   → graph.facebook.com, sistem kullanıcısı jetonu (SUAT), hesap /me/assigned_instagram_accounts ile bulunur
//   instagram → graph.instagram.com, Instagram kullanıcı jetonu, hesap /me ile bulunur
// Private Reply, yorum cevabı, medya ve yorum listesi iki kurulumda da aynı yolda: /<IG_ID>/messages, /<YORUM_ID>/replies…
import { maskele } from "./log.mjs";

// Hız sınırı/geçici durum için bilinen Graph API kodları. Instagram hata sayfası bunları listelemiyor
// (doğrulanamadı); Graph API genelinde bilinen kodlar ve is_transient bayrağı birlikte kullanılıyor.
const HIZ_KODLARI = new Set([4, 17, 32, 613, 80002, 80006]);
const GECICI_KODLAR = new Set([1, 2, ...HIZ_KODLARI]);

export class ApiHatasi extends Error {
  constructor({ mesaj, http = 0, kod = null, altkod = null, gecici = false, hiz = false }) {
    super(mesaj);
    this.http = http;
    this.kod = kod;
    this.altkod = altkod;
    this.gecici = gecici;
    this.hiz = hiz;
    // 190: jeton geçersiz ya da iptal. Meta: "stop retrying and ask your client to connect again".
    this.jetonGecersiz = kod === 190;
  }
  toString() {
    // http 0 = Meta'dan yanıt yok (ağ hatası ya da botun kendi denetimi); "http 0" yazmak yanıltıcı olurdu.
    if (!this.http && this.kod === null) return `API hatası: ${this.message}`;
    return `API hatası (http ${this.http}${this.kod !== null ? `, kod ${this.kod}` : ""}${this.altkod ? `/${this.altkod}` : ""}): ${this.message}`;
  }
}

const uyu = (ms) => new Promise((r) => setTimeout(r, ms));

export class GraphIstemci {
  constructor({ kok, surum, jeton, log, tur = "unified", fetchFn = globalThis.fetch, bekle = uyu, deneme = 4 }) {
    this.tur = tur;
    this.kok = kok.replace(/\/$/, "");
    this.surum = surum;
    this.jeton = jeton; // fonksiyon: yenilenen jeton anında kullanılsın
    this.log = log;
    this.fetch = fetchFn;
    this.bekle = bekle;
    this.deneme = deneme;
  }

  async istek(yontem, yol, { sorgu = {}, govde = null, surumsuz = false, jetonAyri = null } = {}) {
    const url = new URL(`${this.kok}${surumsuz ? "" : "/" + this.surum}${yol}`);
    for (const [k, v] of Object.entries(sorgu)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    url.searchParams.set("access_token", jetonAyri ?? this.jeton());
    let son;
    for (let i = 1; i <= this.deneme; i++) {
      try {
        const yanit = await this.fetch(url, {
          method: yontem,
          headers: govde ? { "Content-Type": "application/json" } : undefined,
          body: govde ? JSON.stringify(govde) : undefined,
          signal: AbortSignal.timeout(30_000),
        });
        const metin = await yanit.text();
        let veri = null;
        try {
          veri = metin ? JSON.parse(metin) : {};
        } catch {
          veri = { ham: metin.slice(0, 300) };
        }
        if (yanit.ok && !veri?.error) return veri;
        const e = veri?.error || {};
        const kod = typeof e.code === "number" ? e.code : null;
        const hiz = HIZ_KODLARI.has(kod) || yanit.status === 429;
        son = new ApiHatasi({
          mesaj: maskele(e.message || e.error_user_msg || veri?.ham || `HTTP ${yanit.status}`),
          http: yanit.status,
          kod,
          altkod: e.error_subcode ?? null,
          gecici: hiz || e.is_transient === true || GECICI_KODLAR.has(kod) || yanit.status >= 500,
          hiz,
        });
      } catch (err) {
        if (err instanceof ApiHatasi) throw err;
        // Ağ hatası / zaman aşımı: bağlantı geri gelince yeniden denenir.
        son = new ApiHatasi({ mesaj: `ağ hatası: ${maskele(err.message)}`, gecici: true });
      }
      if (!son.gecici || i === this.deneme) break;
      // Hız sınırında uzun, diğer geçici hatalarda üstel bekleme.
      const ms = son.hiz ? Math.min(60_000 * i, 300_000) : 2000 * 2 ** (i - 1);
      this.log?.uyari(`${yontem} ${yol} geçici hata (${son.message}); ${Math.round(ms / 1000)} sn sonra ${i + 1}. deneme`);
      await this.bekle(ms);
    }
    throw son;
  }

  // Hesabın kendi kimliği (<IG_ID>). Unified'da /me sistem kullanıcısını döndürür, hesabı değil (Meta:
  // "/me returns the business integration system user"); hesaplar /me/assigned_instagram_accounts'tan gelir.
  // Instagram login'de /me'nin user_id'si webhook'taki entry.id ile aynıdır.
  async ben(istenenId = "") {
    if (this.tur === "unified") {
      // IG_USER_ID verildiyse hesap doğrudan okunur. Sistem kullanıcısı jetonunda
      // /me/assigned_instagram_accounts boş liste ({"data":[]}) dönebiliyor; /<IG_ID>?fields=username ise çalışıyor.
      if (istenenId) {
        const d = await this.istek("GET", `/${istenenId}`, { sorgu: { fields: "id,username" } });
        return { userId: String(d?.id ?? istenenId), kullanici: d?.username ?? null, uygulamaId: null, digerHesaplar: 0 };
      }
      const v = await this.istek("GET", "/me/assigned_instagram_accounts", { sorgu: { fields: "id,username" } });
      const hesaplar = (v?.data ?? []).map((h) => ({ userId: String(h.id), kullanici: h.username ?? null }));
      if (!hesaplar.length) {
        throw new ApiHatasi({
          mesaj: "jetona atanmış Instagram hesabı listesi boş döndü (sistem kullanıcısı jetonunda olabiliyor). .env'de IG_USER_ID'yi doldur (KURULUM.md §4).",
        });
      }
      return { ...hesaplar[0], uygulamaId: null, digerHesaplar: hesaplar.length - 1 };
    }
    const v = await this.istek("GET", "/me", { sorgu: { fields: "user_id,username" } });
    const d = Array.isArray(v?.data) ? v.data[0] : v;
    return { userId: String(d.user_id ?? d.id ?? ""), uygulamaId: d.id ? String(d.id) : null, kullanici: d.username ?? null };
  }

  // Private Reply: yorum yapan kişiye yorum kimliğiyle tek DM. Yanıttaki recipient_id kişinin IGSID'si.
  ozelCevap(igId, commentId, metin) {
    return this.istek("POST", `/${igId}/messages`, { govde: { recipient: { comment_id: String(commentId) }, message: { text: metin } } });
  }

  // Normal DM (Send API). Yalnız kişi bize yazdıktan sonraki 24 saatte gönderilebilir.
  mesajGonder(igId, igsid, metin) {
    return this.istek("POST", `/${igId}/messages`, { govde: { recipient: { id: String(igsid) }, message: { text: metin } } });
  }

  // Yoruma herkese açık cevap.
  yorumaCevap(commentId, metin) {
    return this.istek("POST", `/${commentId}/replies`, { govde: { message: metin } });
  }

  async medyalar(igId, limit) {
    const v = await this.istek("GET", `/${igId}/media`, { sorgu: { fields: "id,timestamp,caption", limit } });
    return v?.data ?? [];
  }

  // "from" alanının Instagram Login'de dönüp dönmediği doğrulanamadı; dönmezse username ile devam edilir.
  async yorumlar(mediaId) {
    try {
      const v = await this.istek("GET", `/${mediaId}/comments`, { sorgu: { fields: "id,text,timestamp,from,username", limit: 50 } });
      return v?.data ?? [];
    } catch (e) {
      if (e instanceof ApiHatasi && e.kod === 100) {
        const v = await this.istek("GET", `/${mediaId}/comments`, { sorgu: { fields: "id,text,timestamp,username", limit: 50 } });
        return v?.data ?? [];
      }
      throw e;
    }
  }

  // Uzun ömürlü Instagram jetonunu yeniler (en az 24 saatlik ve süresi dolmamış olmalı). Sürüm öneki yok.
  // Yalnız "instagram" kurulumunda: Unified'daki sistem kullanıcısı jetonu "Never" seçilince süresiz.
  async jetonYenile(eskiJeton) {
    if (this.tur !== "instagram") throw new Error("jeton yenileme yalnız API_TURU=instagram kurulumunda var");
    return this.istek("GET", "/refresh_access_token", { sorgu: { grant_type: "ig_refresh_token" }, surumsuz: true, jetonAyri: eskiJeton });
  }
}
