// app/api/agent/kisayol/route.ts — Ajansız Windows kasa: masaüstüne + Başlangıç'a "ÇabukPOS Kasa" Chrome kısayolu (.cmd).
// --kiosk-printing: Yazdır penceresi çıkmadan varsayılan yazıcıya basar. --autoplay-policy: sipariş sesi tıklama beklemeden çalar.
// Ayrı --user-data-dir: Chrome zaten açıksa bile bayraklar geçerli olsun (aynı süreçte bayraklar yok sayılır).
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const base = (process.env.APP_URL?.trim() || new URL(req.url).origin).replace(/\/+$/, "");
  if (!/^https?:\/\/[\w.:-]+$/.test(base)) return new Response("Geçersiz adres", { status: 500 });
  const ps = [
    "$ErrorActionPreference = 'Stop'",
    "$c = @(\"$env:ProgramFiles\\Google\\Chrome\\Application\\chrome.exe\", \"${env:ProgramFiles(x86)}\\Google\\Chrome\\Application\\chrome.exe\", \"$env:LOCALAPPDATA\\Google\\Chrome\\Application\\chrome.exe\") | Where-Object { Test-Path $_ } | Select-Object -First 1",
    "if (-not $c) { Write-Host 'Google Chrome bulunamadi. Once Chrome kurun.'; exit 1 }",
    "$prof = Join-Path $env:LOCALAPPDATA 'CabukPOS\\Chrome'",
    `$a = '--user-data-dir=\"' + $prof + '\" --kiosk-printing --autoplay-policy=no-user-gesture-required --no-first-run --app=${base}/kasa?dogrudan=1'`,
    "$sh = New-Object -ComObject WScript.Shell",
    "foreach ($dir in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Startup'))) {",
    "  $l = $sh.CreateShortcut((Join-Path $dir 'CabukPOS Kasa.lnk')); $l.TargetPath = $c; $l.Arguments = $a; $l.IconLocation = $c + ',0'; $l.Save()",
    "}",
    "Write-Host 'Tamam: masaustunde ve bilgisayar acilisinda CabukPOS Kasa.'",
    "Start-Process -FilePath $c -ArgumentList $a",
  ].join("; ");
  const encoded = Buffer.from(ps, "utf16le").toString("base64");
  const lines = [
    "@echo off",
    "title CabukPOS Kasa kisayolu",
    "echo Termal yaziciyi Windows'ta VARSAYILAN yazici yapin (Ayarlar - Yazicilar).",
    `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
    "pause",
  ];
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: { "content-type": "application/octet-stream", "content-disposition": 'attachment; filename="cabukpos-kasa-kisayolu.cmd"', "cache-control": "no-store" },
  });
}
