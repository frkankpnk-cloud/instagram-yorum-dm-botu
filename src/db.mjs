// Yerel SQLite kaydı (Node'un yerleşik node:sqlite modülü; npm paketi ve derleme gerekmez).
// "mod" sütunu KURU ve CANLI kayıtları ayırır: kuru denemede görülen yorum, canlıya geçince "zaten işlendi" sayılmasın.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const SEMA = `
CREATE TABLE IF NOT EXISTS yorumlar (
  comment_id TEXT NOT NULL,
  mod TEXT NOT NULL,
  durum TEXT NOT NULL,
  kampanya TEXT,
  kisi_anahtar TEXT,
  kullanici TEXT,
  media_id TEXT,
  metin TEXT,
  kaynak TEXT,
  aciklama TEXT,
  olusturma TEXT NOT NULL,
  guncelleme TEXT NOT NULL,
  PRIMARY KEY (comment_id, mod)
);
CREATE TABLE IF NOT EXISTS gonderimler (
  kampanya TEXT NOT NULL,
  kisi_anahtar TEXT NOT NULL,
  mod TEXT NOT NULL,
  comment_id TEXT NOT NULL,
  igsid TEXT,
  zaman TEXT NOT NULL,
  PRIMARY KEY (kampanya, kisi_anahtar, mod)
);
CREATE TABLE IF NOT EXISTS bekleyenler (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mod TEXT NOT NULL,
  kampanya TEXT NOT NULL,
  kisi_anahtar TEXT NOT NULL,
  kimlikler TEXT NOT NULL,
  kalan TEXT NOT NULL,
  durum TEXT NOT NULL DEFAULT 'bekliyor',
  olusturma TEXT NOT NULL,
  son_gecerlilik TEXT NOT NULL,
  guncelleme TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS bekleyen_durum ON bekleyenler (durum, mod);
CREATE TABLE IF NOT EXISTS ayarlar (
  anahtar TEXT PRIMARY KEY,
  deger TEXT NOT NULL
);
`;

const simdi = () => new Date().toISOString();

export class Kayit {
  constructor(yol) {
    if (yol !== ":memory:") fs.mkdirSync(path.dirname(yol), { recursive: true });
    this.db = new DatabaseSync(yol);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
    this.db.exec(SEMA);
  }

  kapat() {
    this.db.close();
  }

  // Yorumu "işleniyor" diye sahiplenir. true dönerse bu çağrı işler; false ise zaten işlenmiş/işleniyor.
  // Geçici hatayla kalmış yorum ("hata_gecici") yeniden sahiplenilebilir: kaçanları yakala adımı onları tekrar dener.
  yorumSahiplen(y, mod, kaynak) {
    const t = simdi();
    const r = this.db
      .prepare(
        `INSERT INTO yorumlar (comment_id, mod, durum, kisi_anahtar, kullanici, media_id, metin, kaynak, olusturma, guncelleme)
         VALUES (?, ?, 'isleniyor', ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (comment_id, mod) DO UPDATE SET durum = 'isleniyor', guncelleme = excluded.guncelleme
         WHERE yorumlar.durum = 'hata_gecici'`
      )
      .run(String(y.id), mod, y.kisiAnahtar ?? null, y.kullanici ?? null, y.mediaId ?? null, y.metin ?? null, kaynak, t, t);
    return r.changes === 1;
  }

  yorumDurum(commentId, mod, durum, { kampanya = null, aciklama = null } = {}) {
    this.db
      .prepare(`UPDATE yorumlar SET durum = ?, kampanya = COALESCE(?, kampanya), aciklama = ?, guncelleme = ? WHERE comment_id = ? AND mod = ?`)
      .run(durum, kampanya, aciklama, simdi(), String(commentId), mod);
  }

  yorumAl(commentId, mod) {
    return this.db.prepare(`SELECT * FROM yorumlar WHERE comment_id = ? AND mod = ?`).get(String(commentId), mod);
  }

  // Kaçanları yakala için: bu yorum daha önce görüldü mü (geçici hata dışında)?
  yorumGoruldu(commentId, mod) {
    const r = this.yorumAl(commentId, mod);
    return Boolean(r && r.durum !== "hata_gecici");
  }

  // İlk açılışta eski yorumlar DM'siz "görüldü" işaretlenir (başka bir araçla zaten cevaplanmış yorumlara tekrar DM gitmesin).
  yorumIsaretle(y, mod) {
    const t = simdi();
    this.db
      .prepare(
        `INSERT OR IGNORE INTO yorumlar (comment_id, mod, durum, kisi_anahtar, kullanici, media_id, metin, kaynak, olusturma, guncelleme)
         VALUES (?, ?, 'isaretlendi', ?, ?, ?, ?, 'ilk_acilis', ?, ?)`
      )
      .run(String(y.id), mod, y.kisiAnahtar ?? null, y.kullanici ?? null, y.mediaId ?? null, y.metin ?? null, t, t);
  }

  gonderildiMi(kampanya, kisiAnahtar, mod) {
    return Boolean(
      this.db.prepare(`SELECT 1 FROM gonderimler WHERE kampanya = ? AND kisi_anahtar = ? AND mod = ?`).get(kampanya, kisiAnahtar, mod)
    );
  }

  gonderimKaydet(kampanya, kisiAnahtar, mod, commentId, igsid) {
    this.db
      .prepare(`INSERT OR IGNORE INTO gonderimler (kampanya, kisi_anahtar, mod, comment_id, igsid, zaman) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(kampanya, kisiAnahtar, mod, String(commentId), igsid ?? null, simdi());
  }

  bekleyenEkle({ mod, kampanya, kisiAnahtar, kimlikler, kalan, gecerlilikSaat }) {
    const t = new Date();
    const son = new Date(t.getTime() + gecerlilikSaat * 3600_000);
    this.db
      .prepare(
        `INSERT INTO bekleyenler (mod, kampanya, kisi_anahtar, kimlikler, kalan, olusturma, son_gecerlilik, guncelleme)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(mod, kampanya, kisiAnahtar, JSON.stringify([...new Set(kimlikler.filter(Boolean).map(String))]), JSON.stringify(kalan), t.toISOString(), son.toISOString(), t.toISOString());
  }

  // Mesaj atan kişinin kimliği (IGSID) bekleyen bir devam mesajıyla eşleşiyor mu?
  bekleyenBul(gonderenId, mod) {
    const satirlar = this.db
      .prepare(`SELECT * FROM bekleyenler WHERE durum = 'bekliyor' AND mod = ? AND son_gecerlilik > ? ORDER BY id`)
      .all(mod, simdi());
    return satirlar.filter((s) => JSON.parse(s.kimlikler).includes(String(gonderenId)));
  }

  bekleyenDurum(id, durum) {
    this.db.prepare(`UPDATE bekleyenler SET durum = ?, guncelleme = ? WHERE id = ?`).run(durum, simdi(), id);
  }

  bekleyenleriSuresiDoldur() {
    return this.db
      .prepare(`UPDATE bekleyenler SET durum = 'suresi_doldu', guncelleme = ? WHERE durum = 'bekliyor' AND son_gecerlilik <= ?`)
      .run(simdi(), simdi()).changes;
  }

  ayarAl(anahtar) {
    const r = this.db.prepare(`SELECT deger FROM ayarlar WHERE anahtar = ?`).get(anahtar);
    return r ? JSON.parse(r.deger) : null;
  }

  ayarYaz(anahtar, deger) {
    this.db
      .prepare(`INSERT INTO ayarlar (anahtar, deger) VALUES (?, ?) ON CONFLICT (anahtar) DO UPDATE SET deger = excluded.deger`)
      .run(anahtar, JSON.stringify(deger));
  }

  ozet(mod) {
    const durumlar = this.db.prepare(`SELECT durum, COUNT(*) AS adet FROM yorumlar WHERE mod = ? GROUP BY durum`).all(mod);
    const kampanyalar = this.db.prepare(`SELECT kampanya, COUNT(*) AS adet FROM gonderimler WHERE mod = ? GROUP BY kampanya`).all(mod);
    return { durumlar, kampanyalar };
  }
}
