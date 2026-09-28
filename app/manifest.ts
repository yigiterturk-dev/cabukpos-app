import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return { name: "ÇabukPOS Kasa", short_name: "ÇabukPOS", start_url: "/kasa", scope: "/", display: "standalone", background_color: "#ffffff", theme_color: "#ffffff", lang: "tr" };
}
