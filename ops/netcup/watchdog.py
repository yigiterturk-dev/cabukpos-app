#!/usr/bin/env python3
"""Yedek/restore tazeliğini denetler; eşik aşılırsa maintenance.notify ile alarm verir.

maintenance.py başarısız koşuyu zaten bildirir. Bu bekçi, hiç çalışmayan ya da
status dosyası eskimiş yedekleri yakalar (ör. timer kapalı, disk dolu, servis hiç
tetiklenmedi). Durum: {state_dir}/watchdog-status.json.
"""
import argparse
import datetime as dt
import json
from pathlib import Path
import sys

from maintenance import notify


def check(path, max_age_hours, now):
    """Tek bir status dosyasını denetler. (ok, detail) döner; fırlatmaz."""
    if not path.exists():
        return False, {"reason": "status dosyası yok", "ageHours": None}
    try:
        data = json.loads(path.read_text())
        if data.get("ok") is not True:
            return False, {"reason": "son iş başarısız", "ageHours": None}
        completed = dt.datetime.fromisoformat(data["completed_at"])
        if completed.tzinfo is None:
            completed = completed.replace(tzinfo=dt.timezone.utc)
        age = (now - completed).total_seconds() / 3600
        if age > max_age_hours:
            return False, {"reason": f"yaş {age:.1f} sa > {max_age_hours:g} sa", "ageHours": round(age, 1)}
        return True, {"ageHours": round(age, 1)}
    except Exception:
        return False, {"reason": "status dosyası bozuk", "ageHours": None}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="/etc/cabukpos-ops/config.json")
    args = parser.parse_args()
    config_path = Path(args.config)
    if config_path.stat().st_mode & 0o077:
        raise RuntimeError("config must have mode 0600")
    config = json.loads(config_path.read_text())
    state = Path(config.get("state_dir", "/var/lib/cabukpos-ops"))
    now = dt.datetime.now(dt.timezone.utc)
    checks = (
        ("backup", state / "backup-status.json", float(config.get("backup_max_age_hours", 30))),
        ("restore", state / "restore-status.json", float(config.get("restore_max_age_hours", 192))),
    )
    result = {}
    problems = []
    for name, path, max_age in checks:
        ok, detail = check(path, max_age, now)
        result[name] = {"ok": ok, **detail}
        if not ok:
            problems.append(f"{name}: {detail['reason']}")
    status = {"ok": not problems, "checked_at": now.isoformat(), **result}
    state.mkdir(parents=True, exist_ok=True)
    (state / "watchdog-status.json").write_text(json.dumps(status) + "\n")
    if problems:
        notify(config, "cabukpos-backup-stale", {"problems": problems})
        print("Watchdog: " + "; ".join(problems), flush=True)
        raise SystemExit(1)
    print("Watchdog: yedek ve restore taze", flush=True)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as error:
        detail = str(error) if type(error) is RuntimeError else type(error).__name__
        print(f"Watchdog failed: {detail}", flush=True)
        raise SystemExit(2)
