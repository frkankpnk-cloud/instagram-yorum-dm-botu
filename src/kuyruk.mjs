// Tek sıralı iş kuyruğu: webhook'a hemen 200 dönülür, iş burada arka planda tek tek yapılır.
// Tek sıra olmasının nedeni: aynı kişinin iki yorumu aynı anda işlenip iki DM gitmesin.
export class Kuyruk {
  constructor(log) {
    this.log = log;
    this.isler = [];
    this.calisiyor = false;
    this.bosBekleyenler = [];
  }

  ekle(ad, fn) {
    this.isler.push({ ad, fn });
    if (!this.calisiyor) this.#calis();
  }

  get boyut() {
    return this.isler.length + (this.calisiyor ? 1 : 0);
  }

  async #calis() {
    this.calisiyor = true;
    while (this.isler.length) {
      const { ad, fn } = this.isler.shift();
      try {
        await fn();
      } catch (e) {
        this.log?.hata(`İş başarısız (${ad}): ${e?.stack || e}`);
      }
    }
    this.calisiyor = false;
    for (const r of this.bosBekleyenler.splice(0)) r();
  }

  // Testlerde ve kapanışta: kuyruk boşalana kadar bekle.
  bosalinca() {
    if (!this.calisiyor && this.isler.length === 0) return Promise.resolve();
    return new Promise((r) => this.bosBekleyenler.push(r));
  }
}
