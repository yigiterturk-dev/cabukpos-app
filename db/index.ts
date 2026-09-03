// Server-only Neon (HTTP) Drizzle client.
// İstemciye SIZMASIN diye runtime guard ile korunur — bu modül tarayıcıda
// değerlendirilirse HATA verir. (Faz 2c'de bir client component'ten yanlışlıkla
// import edilirse anında patlar; DATABASE_URL da asla bundle'a girmez.)
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

if (typeof window !== "undefined") {
  throw new Error(
    "db/index.ts yalnızca sunucuda kullanılabilir; client'tan import etmeyin."
  );
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL tanımlı değil (.env.local).");
}

const sql = neon(process.env.DATABASE_URL);

export const db = drizzle(sql, { schema });

export { schema };
