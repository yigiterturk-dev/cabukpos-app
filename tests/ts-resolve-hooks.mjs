// Uzantısız göreli import'ları .ts/.tsx'e, "@/..." alias'ını proje köküne bağlar.
// Uygulama kodu bundler'a göre yazıldığı için (uzantısız + alias) test çalıştırıcısında
// gerekli. Yalnız testlerde; üretim yoluna dokunmaz.
import { existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..");

function parentDir(parentURL) {
  if (!parentURL) return ROOT;
  const p = fileURLToPath(parentURL);
  // parentURL bir dizin URL'i ise ("…/app/") olduğu gibi kullan.
  if (parentURL.endsWith("/")) return p;
  try {
    return statSync(p).isDirectory() ? p : path.dirname(p);
  } catch {
    return path.dirname(p);
  }
}

function firstExisting(base) {
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const c of [`${base}.ts`, `${base}.tsx`, `${base}.mjs`, `${base}.js`,
                   path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (existsSync(c)) return c;
  }
  return null;
}

export async function resolve(specifier, context, next) {
  let abs = null;

  if (specifier.startsWith("@/")) {
    abs = path.join(ROOT, specifier.slice(2));
  } else if (specifier.startsWith("./") || specifier.startsWith("../")) {
    abs = path.resolve(parentDir(context.parentURL), specifier);
  }

  if (abs) {
    const hit = firstExisting(abs);
    if (hit) return next(pathToFileURL(hit).href, context);
  }

  return next(specifier, context);
}
