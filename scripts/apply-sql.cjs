// SQL dosyasını Neon HTTP üzerinden ifade ifade uygular.
// NEDEN: neon-http tek istekte çoklu komut kabul etmez ("cannot insert multiple
// commands into a prepared statement"), bu yüzden dosyayı bölmek gerekir.
// Bölerken $$...$$ gövdeleri ve '--' yorumları korunur (yorum içindeki ';' bölmemeli).
//
// Kullanım: node scripts/apply-sql.cjs db/rate-limit.sql [.env.dosyasi]
const fs = require("fs");
const { neon } = require("@neondatabase/serverless");

const file = process.argv[2];
const envFile = process.argv[3] || ".env.dev";
if (!file) { console.error("kullanim: node scripts/apply-sql.cjs <dosya.sql> [envDosyasi]"); process.exit(1); }

const url = /DATABASE_URL="?([^"\n]*)/.exec(fs.readFileSync(envFile, "utf8"))?.[1];
if (!url) { console.error(`${envFile} icinde DATABASE_URL yok`); process.exit(1); }
const sql = neon(url);

function stripLineComments(src) {
  // Satır sonu '--' yorumlarını at; tek tırnak ve $$ gövdesi içindekilere DOKUNMA.
  let out = "", inS = false, dollar = null;
  for (let i = 0; i < src.length; i++) {
    if (!inS && !dollar) {
      const m = /^\$[A-Za-z_]*\$/.exec(src.slice(i));
      if (m) { dollar = m[0]; out += m[0]; i += m[0].length - 1; continue; }
      if (src[i] === "'") { inS = true; out += src[i]; continue; }
      if (src.startsWith("--", i)) { while (i < src.length && src[i] !== "\n") i++; out += "\n"; continue; }
    } else if (dollar && src.startsWith(dollar, i)) {
      out += dollar; i += dollar.length - 1; dollar = null; continue;
    } else if (inS && src[i] === "'") { inS = false; out += src[i]; continue; }
    out += src[i];
  }
  return out;
}

function split(src) {
  const out = []; let buf = "", dollar = null, inS = false;
  for (let i = 0; i < src.length; i++) {
    if (!dollar && !inS) {
      const m = /^\$[A-Za-z_]*\$/.exec(src.slice(i));
      if (m) { dollar = m[0]; buf += m[0]; i += m[0].length - 1; continue; }
      if (src[i] === "'") { inS = true; buf += src[i]; continue; }
      if (src[i] === ";") { if (buf.trim()) out.push(buf.trim()); buf = ""; continue; }
    } else if (dollar && src.startsWith(dollar, i)) {
      buf += dollar; i += dollar.length - 1; dollar = null; continue;
    } else if (inS && src[i] === "'") { inS = false; buf += src[i]; continue; }
    buf += src[i];
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

(async () => {
  const stmts = split(stripLineComments(fs.readFileSync(file, "utf8")));
  console.log(`${file} -> ${stmts.length} ifade`);
  let fail = 0, i = 0;
  for (const s of stmts) {
    i++;
    const head = s.replace(/\s+/g, " ").slice(0, 60);
    try { await sql.query(s); console.log(`  ${String(i).padStart(2)}. OK    ${head}`); }
    catch (e) { fail++; console.log(`  ${String(i).padStart(2)}. HATA  ${head}\n        -> ${e.message}`); }
  }
  console.log(fail === 0 ? "TAMAM — hepsi uygulandi" : `${fail} ifade HATA verdi`);
  process.exit(fail === 0 ? 0 : 1);
})();
