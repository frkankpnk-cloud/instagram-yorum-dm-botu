// Anahtar kelime eşleşmesi: büyük/küçük harf ve Türkçe karakter farkına duyarsız.
// Neden bu kadar katlama: Türk klavyesiyle "LİMİT", İngiliz klavyesiyle "LIMIT" yazılır; tr küçültmesi
// ikincisini "lımıt" yapar ve eşleşme kaçar. Bu yüzden İ/I/ı/i hepsi "i"ye, ş/ğ/ü/ö/ç da ASCII karşılığına iner.

const ASCII = { ş: "s", ğ: "g", ü: "u", ö: "o", ç: "c", â: "a", î: "i", û: "u" };

export function katla(metin) {
  return String(metin ?? "")
    .replace(/[İIı]/g, "i")
    .toLowerCase()
    .replace(/[şğüöçâîû]/g, (h) => ASCII[h])
    .normalize("NFKD")
    .replace(/\p{M}/gu, "");
}

// Harf/rakam dışı her şey ayraç: "LIMIT!!", "limit🙏", "#limit" hepsi "limit" kelimesini içerir.
export function kelimeler(metin) {
  return katla(metin).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

// Tam kelime (ya da kelime dizisi) eşleşmesi: "limitsiz" LIMIT'i tetiklemez.
export function iceriyorMu(metin, aranan) {
  const m = kelimeler(metin);
  const a = kelimeler(aranan);
  if (a.length === 0 || m.length < a.length) return false;
  outer: for (let i = 0; i <= m.length - a.length; i++) {
    for (let j = 0; j < a.length; j++) if (m[i + j] !== a[j]) continue outer;
    return true;
  }
  return false;
}

// "tam" eşleşme: yorum noktalama/emoji dışında yalnız aranan kelimeden oluşmalı ("hat" gibi günlük kelimeler için).
export function tamMi(metin, aranan) {
  const a = kelimeler(aranan).join(" ");
  return a.length > 0 && kelimeler(metin).join(" ") === a;
}

function gonderiyeUyar(kampanya, mediaId) {
  if (kampanya.gonderi_id === null) return true;
  if (!mediaId) return false;
  return [].concat(kampanya.gonderi_id).map(String).includes(String(mediaId));
}

// Belirli gönderiye bağlı kampanya, her gönderide çalışan kampanyadan önce gelir.
// Aynı seviyede config sırası geçerli.
export function kampanyaBul(kampanyalar, yorumMetni, mediaId) {
  const aktif = kampanyalar.filter((k) => k.aktif && gonderiyeUyar(k, mediaId));
  const sirali = [...aktif.filter((k) => k.gonderi_id !== null), ...aktif.filter((k) => k.gonderi_id === null)];
  for (const k of sirali) {
    for (const kelime of [k.kelime, ...k.esanlam]) {
      const uyar = k.eslesme === "tam" ? tamMi(yorumMetni, kelime) : iceriyorMu(yorumMetni, kelime);
      if (uyar) return { kampanya: k, eslesen: kelime };
    }
  }
  return null;
}
