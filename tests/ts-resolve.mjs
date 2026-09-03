// Node test çalıştırıcısı için minik çözümleyici: uzantısız göreli import'ları .ts'e bağlar
// ve "@/..." alias'ını proje köküne çevirir. Uygulama kodu bundler'a göre yazıldığı için
// (uzantısız + alias) gerekli. Sadece testlerde kullanılır, üretim yoluna dokunmaz.
import { register } from "node:module";

register("./ts-resolve-hooks.mjs", import.meta.url);
