import { defineConfig } from "drizzle-kit";

// DATABASE_URL, drizzle-kit komutuna ortamdan geçer (db:push script'i
// `node --env-file=.env.local` ile .env.local'i yükler).

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  casing: "snake_case",
  verbose: true,
  strict: true,
});
