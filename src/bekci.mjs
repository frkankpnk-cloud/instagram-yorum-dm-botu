// Bekçi: botu ve ngrok tünelini birlikte açık tutar. Biri çökerse bekleyip yeniden başlatır.
// Windows'ta pm2'nin açılışta başlatma desteği resmî değil; bu yüzden Görev Zamanlayıcı bu dosyayı açar
// (scripts/gorev-kaydet.ps1) ve gerisini bekçi yönetir. Ek npm paketi gerekmez.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { KOK, envYukle, ortamAyarlari } from "./ayarlar.mjs";
import { logOlustur } from "./log.mjs";

// Bot .env'i her açılışta kendisi okusun diye ona .env yüklenmeden önceki ortam verilir; yoksa bekçinin
// açılıştaki eski değerleri (ör. boş jeton) bot yeniden başlasa da sürerdi.
const temizOrtam = { ...process.env, BOT_BEKCI: "1" };
envYukle();
const ayar = ortamAyarlari();
const log = logOlustur({ klasor: ayar.logKlasoru, onek: "[bekçi] " });
const kilit = path.join(path.dirname(ayar.dbYolu), "bekci.pid");
fs.mkdirSync(path.dirname(kilit), { recursive: true });

// Aynı anda iki bekçi açılırsa iki bot aynı portu ister; ikincisi kendini kapatır.
try {
  const eski = Number(fs.readFileSync(kilit, "utf8"));
  if (eski && eski !== process.pid) {
    process.kill(eski, 0); // süreç yoksa hata fırlatır
    log.uyari(`Başka bir bekçi zaten çalışıyor (pid ${eski}); bu kopya kapanıyor`);
    process.exit(0);
  }
} catch {
  /* kilit yok ya da eski süreç ölmüş */
}
fs.writeFileSync(kilit, String(process.pid));

const cocuklar = new Map();
let kapaniyor = false;

function gunlukDosya(ad) {
  const gun = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Istanbul" }).slice(0, 10);
  return path.join(ayar.logKlasoru, `${ad}-${gun}.log`);
}

function surdur(ad, komut, argumanlar, { ciktiDosyasi = null, ortam = process.env } = {}) {
  let bekleme = 5_000;
  const baslat = () => {
    if (kapaniyor) return;
    const baslangic = Date.now();
    let cocuk;
    try {
      cocuk = spawn(komut, argumanlar, { cwd: KOK, env: ortam, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      return planla(`başlatılamadı: ${e.message}`);
    }
    cocuklar.set(ad, cocuk);
    // "error" (ör. program bulunamadı) ve "exit" ikisi de gelebilir; yeniden başlatma bir kez planlansın.
    let bitti = false;
    const sonlandi = (neden, planli = false) => {
      if (bitti) return;
      bitti = true;
      cocuklar.delete(ad);
      if (kapaniyor) return;
      // 10 dakikadan uzun yaşadıysa bekleme süresini sıfırla; sürekli çöküyorsa en çok 5 dakikada bir dene.
      // Kod 0 = planlı kapanış (ör. .env değişti): hemen, 2 sn sonra aç.
      if (planli) bekleme = 2_000;
      else if (Date.now() - baslangic > 10 * 60_000) bekleme = 5_000;
      planla(neden);
    };
    const aktar = (akis, hedef) =>
      akis?.on("data", (p) => {
        if (ciktiDosyasi) fs.appendFile(gunlukDosya(ciktiDosyasi), p, () => {});
        else hedef.write(p); // bot kendi log dosyasını zaten yazıyor; burada yalnız konsola
      });
    aktar(cocuk.stdout, process.stdout);
    aktar(cocuk.stderr, process.stderr);
    cocuk.on("error", (e) => {
      if (e.code === "ENOENT") log.hata(`${ad} bulunamadı (${komut}). ngrok kurulu ve PATH'te mi? Ya da .env'de NGROK_YOLU ver (KURULUM.md §3).`);
      else log.hata(`${ad} hatası: ${e.message}`);
      if (!cocuk.pid) sonlandi("başlatılamadı");
    });
    cocuk.on("exit", (kod, sinyal) => sonlandi(`kapandı (kod ${kod ?? "-"}${sinyal ? ", " + sinyal : ""})`, kod === 0));
    if (cocuk.pid) log.bilgi(`${ad} başlatıldı (pid ${cocuk.pid})`);
  };
  const planla = (neden) => {
    log.uyari(`${ad} ${neden}; ${Math.round(bekleme / 1000)} sn sonra yeniden başlatılacak`);
    setTimeout(baslat, bekleme);
    bekleme = Math.min(bekleme * 2, 5 * 60_000);
  };
  baslat();
}

log.bilgi("Bekçi açıldı");
surdur("bot", process.execPath, ["--disable-warning=ExperimentalWarning", path.join(KOK, "src", "index.mjs")], { ortam: temizOrtam });

if (String(process.env.NGROK_KAPALI).toLowerCase() === "true") {
  log.bilgi("NGROK_KAPALI=true: tünel bekçi tarafından açılmıyor");
} else {
  // Ücretsiz planda hesaba atanmış sabit dev domain'i ngrok kendisi kullanır; NGROK_URL verilirse açıkça istenir.
  const argumanlar = ["http", `127.0.0.1:${ayar.port}`, "--log", "stdout"];
  // winget ile kurulan eski ngrok sürümü (3.3.1) "--url" bayrağını tanımıyor ("unknown flag: --url"); "--domain" eski ve yeni sürümlerde çalışıyor.
  if (ayar.ngrokUrl) argumanlar.push("--domain", ayar.ngrokUrl.replace(/^https?:\/\//, ""));
  surdur("ngrok", ayar.ngrokYolu, argumanlar, { ciktiDosyasi: "ngrok" });
}

const kapat = () => {
  if (kapaniyor) return;
  kapaniyor = true;
  log.bilgi("Bekçi kapanıyor; bot ve ngrok durduruluyor");
  for (const c of cocuklar.values()) c.kill();
  try {
    fs.unlinkSync(kilit);
  } catch {
    /* zaten yok */
  }
  setTimeout(() => process.exit(0), 3_000).unref();
};
process.on("SIGINT", kapat);
process.on("SIGTERM", kapat);
