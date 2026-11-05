// Bütün .mjs dosyalarını "node --check" ile sözdizimi kontrolünden geçirir (npm run check / npm test'in ilk adımı).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dosyalar = ["src", "test", "scripts"].flatMap((k) =>
  fs.existsSync(path.join(kok, k)) ? fs.readdirSync(path.join(kok, k)).filter((f) => f.endsWith(".mjs")).map((f) => path.join(kok, k, f)) : []
);
let hata = 0;
for (const f of dosyalar) {
  const r = spawnSync(process.execPath, ["--check", f], { encoding: "utf8" });
  if (r.status !== 0) {
    hata++;
    console.error(`HATA ${path.relative(kok, f)}\n${r.stderr}`);
  }
}
console.log(`node --check: ${dosyalar.length - hata}/${dosyalar.length} dosya temiz`);
process.exit(hata ? 1 : 0);
