// Hatırlatma şablonu doldurma. Kullanıcının girdiği şablon {ad} {saat} {hizmet} {isletme}
// yer tutucularını taşır. Bilinmeyen yer tutucu OLDUĞU GİBİ kalır — sessizce silmek,
// müşteriye yarım cümle göndermekten daha kötü bir hata gizler.
export type TemplateVars = {
  ad: string;
  saat: string;
  hizmet: string;
  isletme: string;
};

export function renderTemplate(template: string, vars: TemplateVars): string {
  return template
    .replaceAll("{ad}", vars.ad)
    .replaceAll("{saat}", vars.saat)
    .replaceAll("{hizmet}", vars.hizmet)
    .replaceAll("{isletme}", vars.isletme);
}
