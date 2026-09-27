# Plan dosyasındaki kod bloklarını ilk satır yorumundaki yola yazar. Kullanım: python3 scripts/plan-extract.py yol1 yol2 ...
import re, sys, os
plan = open("docs/superpowers/plans/2026-09-28-cabukpos-m1-cekirdek-kasa.md").read()
want = set(sys.argv[1:])
for lang, body in re.findall(r"```(ts|js|sql)\n(.*?)```", plan, re.S):
    m = re.match(r"(?://|--) ((?:tests|lib|db|scripts|e2e)/[\w./-]+)", body.split("\n", 1)[0])
    if m and m.group(1) in want:
        os.makedirs(os.path.dirname(m.group(1)), exist_ok=True)
        open(m.group(1), "w").write(body)
        want.discard(m.group(1))
if want: sys.exit(f"bulunamadı: {want}")
