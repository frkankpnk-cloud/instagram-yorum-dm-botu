// Uzun ömürlü erişim jetonu (60 gün) ve otomatik yenileme.
// Yenilenen jeton .env'e yazılmaz (bot .env'i değiştirmesin); data/bot.sqlite içinde tutulur.
// Sen .env'e YENİ bir jeton koyarsan (özeti değişir) bot onu esas alır ve eski kaydı bırakır.
import crypto from "node:crypto";
import { gizliEkle } from "./log.mjs";

const SAAT = 3600_000;
const GUN = 24 * SAAT;

const ozet = (s) => crypto.createHash("sha256").update(String(s)).digest("hex").slice(0, 16);

export class JetonYonetici {
  // yenilenebilir=false: Unified login'in sistem kullanıcısı jetonu ("Expiration: Never") — Meta'ya göre
  // süresiz ve yenileme uç noktası yok; kontrol sessizce hiçbir şey yapmaz, hata da vermez.
  constructor({ envJeton, kayit, log, simdi = () => Date.now(), yenilemeGun = 7, yenilenebilir = true }) {
    this.yenilenebilir = yenilenebilir;
    this.envJeton = envJeton;
    this.kayit = kayit;
    this.log = log;
    this.simdi = simdi;
    this.yenilemeGun = yenilemeGun;
    this.durum = null;
  }

  baslat() {
    if (!this.envJeton) throw new Error("IG_ACCESS_TOKEN boş. .env dosyasına uzun ömürlü jetonu yaz (KURULUM.md §4).");
    const kaynak = ozet(this.envJeton);
    const kayitli = this.kayit.ayarAl("jeton");
    if (kayitli && kayitli.kaynak === kaynak && kayitli.jeton) {
      this.durum = kayitli;
    } else {
      this.durum = { jeton: this.envJeton, kaynak, alindi: this.simdi(), yenilendi: null, bitis: null, sonHata: null };
      this.kayit.ayarYaz("jeton", this.durum);
      if (kayitli) this.log?.bilgi(".env'de yeni jeton görüldü; kayıtlı eski jeton bırakıldı");
    }
    gizliEkle(this.envJeton);
    gizliEkle(this.durum.jeton);
    return this;
  }

  mevcut() {
    return this.durum.jeton;
  }

  // İlk yenileme jeton görüldükten 25 saat sonra (Meta: en az 24 saatlik olmalı); sonra haftada bir.
  // Jetonun gerçek yaşı bilinmediği için ilk yenilemeyi bir haftaya bırakmak riskli olurdu.
  sonrakiYenileme() {
    const d = this.durum;
    return d.yenilendi ? d.yenilendi + this.yenilemeGun * GUN : d.alindi + 25 * SAAT;
  }

  async kontrol(istemci) {
    if (!this.yenilenebilir) return false;
    const simdi = this.simdi();
    if (simdi < this.sonrakiYenileme()) return false;
    try {
      const v = await istemci.jetonYenile(this.durum.jeton);
      if (!v?.access_token) throw new Error("yanıtta access_token yok");
      gizliEkle(v.access_token);
      this.durum = {
        ...this.durum,
        jeton: v.access_token,
        yenilendi: simdi,
        bitis: v.expires_in ? simdi + Number(v.expires_in) * 1000 : null,
        sonHata: null,
      };
      this.kayit.ayarYaz("jeton", this.durum);
      const bitis = this.durum.bitis ? new Date(this.durum.bitis).toLocaleDateString("tr-TR") : "bilinmiyor";
      this.log?.bilgi(`Erişim jetonu yenilendi; yeni bitiş: ${bitis}`);
      return true;
    } catch (e) {
      this.durum = { ...this.durum, sonHata: String(e.message || e) };
      // Sonraki denemeyi 6 saat sonraya at; aksi halde her kontrolde yeniden dener.
      if (this.durum.yenilendi) this.durum.yenilendi = simdi - this.yenilemeGun * GUN + 6 * SAAT;
      else this.durum.alindi = simdi - 25 * SAAT + 6 * SAAT;
      this.kayit.ayarYaz("jeton", this.durum);
      const kalanGun = this.durum.bitis ? Math.floor((this.durum.bitis - simdi) / GUN) : null;
      const ek = kalanGun !== null && kalanGun <= 10 ? ` DİKKAT: jetonun bitmesine ${kalanGun} gün var; yenisini al (KURULUM.md §4).` : "";
      this.log?.hata(`Jeton yenilenemedi: ${e}. 6 saat sonra tekrar denenecek.${ek}`);
      return false;
    }
  }
}
