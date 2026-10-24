#!/usr/bin/env python3
"""Explicit production SQL gate: verified fresh backup, exact rehearsed SQL, atomic checks."""
import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess as sp
import tempfile
from urllib.parse import unquote, urlparse

from maintenance import docker, verify
from release_check import release_transaction


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--release-dir", type=Path, required=True)
    parser.add_argument("--expected-sha256", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    os.umask(0o077)
    config = json.loads(Path("/etc/cabukpos-ops/config.json").read_text())
    state = Path(config.get("state_dir", "/var/lib/cabukpos-ops"))
    sql = (args.release_dir / "db/releases/2026-10-24-hq-stock.sql").read_text() + "\n" + (args.release_dir / "db/rls.sql").read_text()
    digest = hashlib.sha256(sql.encode()).hexdigest()
    evidence = json.loads((state / "release-evidence.json").read_text())
    if digest != args.expected_sha256 or digest != evidence["migration_rls_sha256"]:
        raise RuntimeError("SQL does not match the successful rehearsal")
    now = dt.datetime.now(dt.timezone.utc)
    for job in ("backup", "release"):
        status = json.loads((state / (job + "-status.json")).read_text())
        age = (now - dt.datetime.fromisoformat(status["completed_at"])).total_seconds()
        if status.get("ok") is not True or not 0 <= age <= 3600:
            raise RuntimeError("fresh backup/release success required (within one hour)")
    artifact = sorted((state / "backups").glob("cabukpos-*.dump.enc"))[-1]
    verify(artifact, config["encryption_key"])
    with (state / "maintenance.lock").open("w") as lock, tempfile.TemporaryDirectory(prefix="apply-", dir=state) as directory:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        parsed = urlparse(config["database_url"])
        values = {"PGHOST": parsed.hostname, "PGPORT": str(parsed.port or 5432),
                  "PGUSER": unquote(parsed.username or ""), "PGPASSWORD": unquote(parsed.password or ""),
                  "PGDATABASE": unquote(parsed.path.lstrip("/")), "PGCONNECT_TIMEOUT": "20",
                  "PGSSLMODE": "verify-full", "PGSSLROOTCERT": "/etc/ssl/certs/ca-certificates.crt",
                  "PGAPPNAME": "cabukpos-reviewed-release"}
        if any(not isinstance(v, str) or "\n" in v or "\r" in v for v in values.values()):
            raise RuntimeError("invalid PostgreSQL configuration")
        env_file = Path(directory) / "pg.env"
        env_file.write_text("".join(f"{k}={v}\n" for k, v in values.items()))
        env_file.chmod(0o600)

        def query(statement):
            command = docker(config["image"]) + ["-i", "--env-file", str(env_file), "--mount",
                "type=bind,src=/etc/ssl/certs/ca-certificates.crt,dst=/etc/ssl/certs/ca-certificates.crt,readonly",
                config["image"], "psql", "-X", "-At", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=sqlstate"]
            result = sp.run(command, input=statement.encode(), capture_output=True, timeout=180)
            if result.returncode:
                codes = re.findall(r"ERROR:\s+([A-Z0-9]{5})", result.stderr.decode(errors="replace"))
                raise RuntimeError("production SQL failed; SQLSTATE=" + ",".join(codes))
            return result.stdout.decode().strip()

        preflight = json.loads(query("""select json_build_object(
          'version',current_setting('server_version_num')::int,
          'owner',current_user='neondb_owner','primary',not pg_is_in_recovery(),
          'public_table_bytes',(select coalesce(sum(pg_total_relation_size(c.oid)),0) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'),
          'long_transactions',(select count(*) from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and xact_start<now()-interval '30 seconds'),
          'active_sessions',(select count(*) from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and state='active'),
          'safe_app_role',(select not rolsuper and not rolbypassrls from pg_roles where rolname='cabukpos_app')
        )::text;"""))
        if not (180000 <= preflight["version"] < 190000 and preflight["owner"] and preflight["primary"]
                and preflight["safe_app_role"] and preflight["long_transactions"] == 0):
            raise RuntimeError("production preflight did not pass")
        print("Production preflight: " + json.dumps(preflight), flush=True)
        if not args.apply:
            print("Read-only preflight complete; --apply required for writes", flush=True)
            return
        query(release_transaction(sql))
        record = {"ok": True, "completed_at": dt.datetime.now(dt.timezone.utc).isoformat(),
                  "migration_rls_sha256": digest, "backup": artifact.name, "preflight": preflight,
                  "transaction": "committed", "counts_totals_preserved": True, "forced_rls_tables": 9}
        (state / "production-release.json").write_text(json.dumps(record, indent=2) + "\n")
        print("Production release committed; data counts/totals preserved; nine tables enforce RLS", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("Release stopped: " + (str(error) if type(error) is RuntimeError else type(error).__name__), flush=True)
        raise SystemExit(1)
