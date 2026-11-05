// Webhook sunucusu (Node'un kendi http modülü). İmza ham gövde üzerinden doğrulanır, sonra hemen 200 dönülür;
// iş kuyruğa atılır. Meta 200'ü geç alırsa aynı olayı tekrar yollar; kayıt zaten tekrarı engeller.
import http from "node:http";
import { imzaDogrula } from "./imza.mjs";
import { webhookCoz } from "./isleyici.mjs";

const AZAMI_GOVDE = 1024 * 1024;

export function sunucuOlustur({ ayar, isleyici, kuyruk, log }) {
  return http.createServer((req, res) => {
    const url = new URL(req.url, "http://yerel");
    const yanit = (kod, govde, tur = "text/plain; charset=utf-8") => {
      res.writeHead(kod, { "Content-Type": tur });
      res.end(govde);
    };

    if (url.pathname === "/saglik" && req.method === "GET") {
      const mod = !isleyici ? "kurulum" : ayar.dryRun ? "kuru" : "canli";
      return yanit(200, JSON.stringify({ ok: true, mod, dry_run: ayar.dryRun, kuyruk: kuyruk.boyut }), "application/json");
    }
    if (url.pathname !== "/webhook") return yanit(404, "yok");

    if (req.method === "GET") {
      // Meta'nın abonelik doğrulaması: verify token eşleşirse hub.challenge aynen geri döner.
      const mod = url.searchParams.get("hub.mode");
      const jeton = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge") ?? "";
      if (mod === "subscribe" && ayar.dogrulamaJetonu && jeton === ayar.dogrulamaJetonu) {
        log.bilgi("Webhook doğrulama isteği kabul edildi (Meta abonelik testi)");
        return yanit(200, challenge);
      }
      log.uyari("Webhook doğrulama isteği reddedildi: verify token eşleşmedi");
      return yanit(403, "dogrulama basarisiz");
    }

    if (req.method !== "POST") return yanit(405, "yontem yok");

    const parcalar = [];
    let boyut = 0;
    let asildi = false;
    req.on("data", (p) => {
      boyut += p.length;
      if (boyut > AZAMI_GOVDE) {
        asildi = true;
        req.destroy();
        return;
      }
      parcalar.push(p);
    });
    req.on("end", () => {
      if (asildi) return;
      const ham = Buffer.concat(parcalar);
      if (!ayar.imzaSirlari.length) {
        // Kurulum modu, secret henüz yok: imza doğrulanamaz, olay hiç işlenmez. Yine de 200 dönülür ki Meta
        // kurulum sırasındaki test olaylarında aboneliği "başarısız" saymasın.
        yanit(200, "EVENT_RECEIVED");
        log.uyari("Webhook geldi ama META_APP_SECRET yok; imza doğrulanamadı, olay İŞLENMEDİ (.env'e secret'ı yaz)");
        return;
      }
      if (!imzaDogrula(ham, req.headers["x-hub-signature-256"], ayar.imzaSirlari)) {
        log.uyari("İmzası geçersiz webhook reddedildi (yanlış secret ya da sahte istek)");
        return yanit(403, "imza gecersiz");
      }
      yanit(200, "EVENT_RECEIVED");

      let govde;
      try {
        govde = JSON.parse(ham.toString("utf8"));
      } catch {
        log.uyari("Webhook gövdesi JSON değil; atlandı");
        return;
      }
      if (ayar.hamLog) log.bilgi(`HAM webhook: ${ham.toString("utf8").slice(0, 4000)}`);
      if (govde.object && govde.object !== "instagram") {
        log.uyari(`Beklenmeyen webhook nesnesi: ${govde.object}; atlandı`);
        return;
      }
      const olaylar = webhookCoz(govde);
      if (!isleyici) {
        // Kurulum modu (jeton yok): imzası doğru olay görülür ama hiçbir işlem yapılmaz.
        const ozet = olaylar.map((o) => (o.tur === "yorum" ? `yorum "${o.yorum.metin.slice(0, 40)}"` : "mesaj")).join(", ");
        log.bilgi(`KURULUM MODU: imzası doğru webhook alındı (${ozet || "tanınmayan olay"}); jeton olmadığı için işlenmedi`);
        return;
      }
      for (const olay of olaylar) {
        if (olay.tur === "yorum") {
          kuyruk.ekle(`yorum ${olay.yorum.id}`, () => isleyici.yorumIsle(olay.yorum, { kaynak: "webhook", hesapId: olay.hesapId }));
        } else if (olay.tur === "mesaj") {
          kuyruk.ekle(`mesaj ${olay.mesaj.mid ?? ""}`, () => isleyici.mesajIsle(olay.mesaj));
        }
      }
    });
  });
}
