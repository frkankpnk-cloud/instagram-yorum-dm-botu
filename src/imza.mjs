// Meta webhook imzası: X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(ham gövde, app secret).
// Ham bayt üzerinden hesaplanmalı; JSON.parse sonrası yeniden üretilen metin imzayı bozar.
import crypto from "node:crypto";

export function imzaUret(hamGovde, sir) {
  return "sha256=" + crypto.createHmac("sha256", sir).update(hamGovde).digest("hex");
}

export function imzaDogrula(hamGovde, baslik, sirlar) {
  if (!baslik || typeof baslik !== "string" || !baslik.startsWith("sha256=")) return false;
  const gelen = Buffer.from(baslik.trim());
  for (const sir of sirlar) {
    const beklenen = Buffer.from(imzaUret(hamGovde, sir));
    // Zamanlama saldırısına karşı sabit süreli karşılaştırma.
    if (beklenen.length === gelen.length && crypto.timingSafeEqual(beklenen, gelen)) return true;
  }
  return false;
}
