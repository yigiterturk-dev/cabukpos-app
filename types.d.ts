// TypeScript 7, yan etkili CSS import'u için tip bildirimi istiyor
// (`import "./globals.css"` — TS2882). Next'in next-env.d.ts'i bunu kapsamıyor.
declare module "*.css";
