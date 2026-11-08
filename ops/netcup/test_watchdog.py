"""watchdog.py — yedek tazeliği denetiminin birim testleri."""
import datetime as dt
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

BASE = Path(__file__).parent
sys.path.insert(0, str(BASE))
SPEC = importlib.util.spec_from_file_location("watchdog", BASE / "watchdog.py")
w = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(w)

NOW = dt.datetime(2026, 11, 8, 12, 0, tzinfo=dt.timezone.utc)


def status(directory, completed_at, ok=True, broken=False):
    path = Path(directory) / "backup-status.json"
    path.write_text("bozuk" if broken else json.dumps({"job": "backup", "ok": ok, "completed_at": completed_at}))
    return path


class CheckTest(unittest.TestCase):
    def test_missing_status(self):
        with tempfile.TemporaryDirectory() as d:
            ok, detail = w.check(Path(d) / "backup-status.json", 30, NOW)
        self.assertFalse(ok)
        self.assertIn("yok", detail["reason"])
        self.assertIsNone(detail["ageHours"])

    def test_fresh_status(self):
        with tempfile.TemporaryDirectory() as d:
            ok, detail = w.check(status(d, "2026-11-08T10:00:00+00:00"), 30, NOW)
        self.assertTrue(ok)
        self.assertEqual(detail["ageHours"], 2.0)

    def test_stale_status(self):
        with tempfile.TemporaryDirectory() as d:
            ok, detail = w.check(status(d, "2026-11-06T10:00:00+00:00"), 30, NOW)
        self.assertFalse(ok)
        self.assertIn("50.0", detail["reason"])
        self.assertEqual(detail["ageHours"], 50.0)

    def test_boundary_is_fresh(self):
        with tempfile.TemporaryDirectory() as d:
            ok, _ = w.check(status(d, "2026-11-07T06:00:00+00:00"), 30, NOW)  # tam 30 saat
        self.assertTrue(ok)

    def test_failed_status(self):
        with tempfile.TemporaryDirectory() as d:
            ok, detail = w.check(status(d, "2026-11-08T10:00:00+00:00", ok=False), 30, NOW)
        self.assertFalse(ok)
        self.assertIn("başarısız", detail["reason"])

    def test_broken_status(self):
        with tempfile.TemporaryDirectory() as d:
            ok, detail = w.check(status(d, "", broken=True), 30, NOW)
        self.assertFalse(ok)
        self.assertIn("bozuk", detail["reason"])

    def test_naive_timestamp_treated_as_utc(self):
        with tempfile.TemporaryDirectory() as d:
            ok, detail = w.check(status(d, "2026-11-08T10:00:00"), 30, NOW)
        self.assertTrue(ok)
        self.assertEqual(detail["ageHours"], 2.0)


if __name__ == "__main__":
    unittest.main()
