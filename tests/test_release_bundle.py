import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ops/netcup"))
from release_bundle import load_bundle, unwrap_transaction
from release_check import release_transaction


class ReleaseBundleTests(unittest.TestCase):
    def test_current_bundle_contains_every_migration_and_no_inner_commit(self):
        sql, tables, paths = load_bundle(ROOT)
        self.assertEqual(set(paths), {str(p.relative_to(ROOT)) for p in (ROOT / "db/releases").glob("*.sql")})
        self.assertIn("procurement_receipts", tables)
        self.assertIn("attendance", tables)
        self.assertIn("staff_plans", tables)
        self.assertNotIn("reservation_settings", tables)
        self.assertFalse(any(line.strip().lower() in {"begin;", "commit;"} for line in sql.splitlines()))
        transaction = release_transaction(sql, tables)
        self.assertEqual(sum(line == "COMMIT;" for line in transaction.splitlines()), 1)
        self.assertIn("cabukpos_release_rows_before", transaction)
        self.assertIn(f"<> {len(tables)} THEN", transaction)

    def test_outer_wrapper_only(self):
        self.assertEqual(unwrap_transaction("-- header\nbegin;\nselect 1;\ncommit;"), "-- header\nselect 1;")
        for value in ["select 1;\ncommit;", "begin;\nselect 1;", "begin;\ncommit;\nselect 2;", "begin;\nrollback;"]:
            with self.assertRaises(RuntimeError):
                unwrap_transaction(value)

    def test_manifest_rejects_path_escape_and_duplicates(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "ops/netcup").mkdir(parents=True)
            for paths in [["../../outside.sql"], ["db/releases/a.sql", "db/releases/a.sql"]]:
                (root / "ops/netcup/release-manifest.json").write_text(json.dumps({"version":1,"migrations":paths,"rls":"db/rls.sql"}))
                with self.assertRaises(RuntimeError):
                    load_bundle(root)


if __name__ == "__main__":
    unittest.main()
