// app/api/agent/kurulum/route.ts — Windows tek tık kurulum dosyası (.cmd): Node.js yoksa winget ile kurar,
// ajan betiğini BU sunucunun adresiyle çalıştırır (test/prod karışmaz). İçinde gizli bilgi yok; eşleme kodu kurulumda sorulur.
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const base = (process.env.APP_URL?.trim() || new URL(req.url).origin).replace(/\/+$/, "");
  if (!/^https?:\/\/[\w.:-]+$/.test(base)) return new Response("Geçersiz adres", { status: 500 });
  const lines = [
    "@echo off",
    "chcp 65001 >nul",
    "title CabukPOS ajan kurulumu",
    // Açılışta başlatma görevi (schtasks) yönetici ister → kendini yönetici olarak yeniden açar.
    "net session >nul 2>&1",
    "if errorlevel 1 (",
    "  echo Yonetici izni isteniyor, gelen pencerede Evet deyin...",
    `  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"`,
    "  exit /b",
    ")",
    "where node >nul 2>nul",
    "if errorlevel 1 (",
    "  echo Node.js kuruluyor, birkac dakika surebilir...",
    "  winget install -e --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements",
    '  set "PATH=%PATH%;%ProgramFiles%\\nodejs"',
    ")",
    "where node >nul 2>nul",
    "if errorlevel 1 (",
    "  echo Node.js kurulamadi. https://nodejs.org adresinden LTS surumunu kurup bu dosyayi tekrar acin.",
    "  pause",
    "  exit /b 1",
    ")",
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "$f = Join-Path $env:TEMP 'cabukpos-agent-install.ps1'; Invoke-WebRequest -UseBasicParsing '${base}/indir/cabukpos-agent-install.ps1' -OutFile $f; & $f -BaseUrl '${base}'"`,
    "pause",
  ];
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": 'attachment; filename="cabukpos-kurulum.cmd"',
      "cache-control": "no-store",
    },
  });
}
