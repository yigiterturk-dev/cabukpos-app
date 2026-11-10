#!/usr/bin/env python3
"""Encrypted PostgreSQL backups and network-isolated restore rehearsals.

No production restore target is accepted. Credentials never enter command args.
"""
import argparse
import datetime as dt
import fcntl
import hashlib
import hmac
import json
import os
import re
from pathlib import Path
import secrets
import subprocess as sp
import tempfile
import urllib.request
from urllib.parse import parse_qs, unquote, urlparse


def run(args, **kwargs):
    result = sp.run(args, stdout=sp.PIPE, stderr=sp.PIPE, **kwargs)
    if result.returncode:
        raise RuntimeError(f"{args[0]} failed (exit {result.returncode}); credentials/output withheld")
    return result.stdout


def pipeline(commands, *, source=None, destination=None, env=None):
    processes = []
    errors = []
    previous = source
    try:
        for index, command in enumerate(commands):
            last = index == len(commands) - 1
            error_file = tempfile.TemporaryFile()
            errors.append(error_file)
            child = sp.Popen(command, stdin=previous, stdout=destination if last else sp.PIPE,
                             stderr=error_file, env=env)
            if previous is not None and previous is not source:
                previous.close()
            previous = child.stdout
            processes.append(child)
        codes = [child.wait() for child in reversed(processes)][::-1]
        if any(codes):
            hints = []
            for stream in errors:
                stream.seek(0)
                text = stream.read().decode(errors="replace")
                hints += re.findall(r'role "([a-zA-Z0-9_]+)" does not exist', text)
                if "already exists" in text:
                    hints.append("object already exists")
            raise RuntimeError("pipeline exit codes: " + ",".join(map(str, codes)) + "; hints=" + ",".join(hints))
    finally:
        for child in processes:
            if child.poll() is None:
                child.kill()
                child.wait()
        for stream in errors:
            stream.close()


def signature(path, key):
    digest = hmac.new(key.encode(), digestmod=hashlib.sha256)
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify(path, key):
    metadata = json.loads(path.with_suffix(".json").read_text())
    if not hmac.compare_digest(metadata["hmac_sha256"], signature(path, key)):
        raise RuntimeError("backup integrity check failed")


def crypt(decrypt=False):
    return ["openssl", "enc", "-aes-256-cbc", "-pbkdf2", "-salt", "-iter", "310000",
            *( ["-d"] if decrypt else []), "-pass", "env:CABUKPOS_BACKUP_KEY"]


def docker(image):
    return ["docker", "run", "--rm", "--pull=never", "--memory=512m", "--cpus=0.5",
            "--pids-limit=128", "--cap-drop=ALL", "--security-opt=no-new-privileges",
            "--read-only", "--tmpfs", "/tmp:rw,nosuid,size=64m", "--entrypoint", ""]


def _alert_settings(config):
    alert = config.get("alert") or {}
    return {
        "webhook_url": (alert.get("webhook_url") or config.get("alert_webhook_url") or "").strip(),
        "email": (alert.get("email") or config.get("alert_email") or "").strip(),
        "resend_api_key": (alert.get("resend_api_key") or config.get("resend_api_key") or "").strip(),
        "mail_from": (alert.get("mail_from") or config.get("mail_from") or "").strip(),
    }


def notify(config, event, detail):
    """Best-effort failure alert; webhook önce, yoksa Resend e-posta. Asla fırlatmaz."""
    settings = _alert_settings(config)
    payload = {"service": "cabukpos-ops", "event": event, "detail": detail,
               "at": dt.datetime.now(dt.timezone.utc).isoformat()}
    attempts = []
    if settings["webhook_url"]:
        attempts.append((settings["webhook_url"], payload, {}))
    elif settings["email"] and settings["resend_api_key"] and settings["mail_from"]:
        attempts.append(("https://api.resend.com/emails", {
            "from": settings["mail_from"],
            "to": [settings["email"]],
            "subject": f"[ÇabukPOS ops] {event}",
            "text": f"{event}\n{payload['at']}\n\n{json.dumps(detail, ensure_ascii=False, indent=2)}\n",
        }, {"authorization": f"Bearer {settings['resend_api_key']}"}))
    for url, body, headers in attempts:
        try:
            request = urllib.request.Request(
                url, data=json.dumps(body).encode(), method="POST",
                headers={"content-type": "application/json", **headers})
            urllib.request.urlopen(request, timeout=5).close()
        except Exception:
            pass


def offsite(config, path, backups):
    """Başarılı yedekten sonra isteğe bağlı ikinci kopya komutu. {path}/{dir} genişletilir."""
    command = config.get("offsite_command")
    if command is None:
        return False
    if (not isinstance(command, list) or not command
            or any(not isinstance(part, str) or not part for part in command)):
        raise RuntimeError("offsite_command must be a non-empty list of strings")
    expanded = [part.replace("{path}", str(path)).replace("{dir}", str(backups)) for part in command]
    run(expanded)
    return True


def backup(config, work, backups, env):
    image = config["image"]
    pg_env = work / "postgres.env"
    url = config["database_url"]
    if "\n" in url or "\r" in url:
        raise RuntimeError("invalid database URL")
    parsed = urlparse(url)
    if parsed.scheme not in ("postgres", "postgresql") or not parsed.hostname:
        raise RuntimeError("invalid PostgreSQL URL")
    query = parse_qs(parsed.query)
    sslmode = (query.get("sslmode", ["verify-full"])[0] or "verify-full").strip().lower()
    tls = sslmode in ("verify-full", "verify-ca")
    tls_args = ["--mount",
                "type=bind,src=/etc/ssl/certs/ca-certificates.crt,dst=/etc/ssl/certs/ca-certificates.crt,readonly"] if tls else []
    net_args = ["--network=host"] if parsed.hostname in ("127.0.0.1", "localhost", "::1") else []
    values = {"PGHOST": parsed.hostname, "PGPORT": str(parsed.port or 5432),
              "PGUSER": unquote(parsed.username or ""), "PGPASSWORD": unquote(parsed.password or ""),
              "PGDATABASE": unquote(parsed.path.lstrip("/")), "PGCONNECT_TIMEOUT": "20",
              "PGSSLMODE": sslmode,
              "PGCHANNELBINDING": query.get("channel_binding", ["prefer"])[0]}
    if tls:
        values["PGSSLROOTCERT"] = "/etc/ssl/certs/ca-certificates.crt"
    if any("\n" in value or "\r" in value for value in values.values()):
        raise RuntimeError("invalid PostgreSQL environment")
    pg_env.write_text("".join(f"{key}={value}\n" for key, value in values.items()))
    pg_env.chmod(0o600)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = backups / f"cabukpos-{stamp}-{secrets.token_hex(3)}.dump.enc"
    partial = work / "backup.partial"
    with partial.open("wb") as target:
        pipeline([docker(image) + ["--env-file", str(pg_env), *net_args, *tls_args,
                                  image, "pg_dump", "--format=custom",
                                  "--no-owner", "--no-privileges"], crypt()], destination=target, env=env)
        target.flush()
        os.fsync(target.fileno())
    # Decrypt and read the catalog before publishing the encrypted artifact.
    with partial.open("rb") as source, open(os.devnull, "wb") as target:
        pipeline([crypt(True), docker(image) + ["-i", "--network=none", image, "pg_restore", "--list"]],
                 source=source, destination=target, env=env)
    metadata = {"created_at": stamp, "bytes": partial.stat().st_size,
                "hmac_sha256": signature(partial, config["encryption_key"]), "image": image}
    partial.replace(path)
    path.with_suffix(".json").write_text(json.dumps(metadata) + "\n")
    if offsite(config, path, backups):
        metadata["offsite_ok"] = True
        path.with_suffix(".json").write_text(json.dumps(metadata) + "\n")
        print(f"Offsite copy verified: {path.name}", flush=True)
    print(f"Backup verified: {path.name} ({metadata['bytes']} bytes)", flush=True)
    return path


def restore(config, work, path, env, release_dir=None):
    verify(path, config["encryption_key"])
    name = "cabukpos-rehearsal-" + secrets.token_hex(8)
    data = work / "postgres"
    data.mkdir()
    # Host parent stays 0700; container's postgres user must traverse this mount.
    data.chmod(0o755)
    credentials = work / "rehearsal.env"
    credentials.write_text("POSTGRES_USER=rehearsal\nPOSTGRES_DB=rehearsal\nPOSTGRES_PASSWORD=" + secrets.token_hex(32) + "\n")
    credentials.chmod(0o600)
    try:
        # No ports, no external network, no live database URL in this container.
        run(["docker", "run", "--detach", "--pull=never", "--name", name,
             "--network=none", "--memory=512m", "--cpus=0.5", "--pids-limit=128",
             "--security-opt=no-new-privileges", "--env-file", str(credentials),
             "--mount", f"type=bind,src={data},dst=/var/lib/postgresql",
             "--health-cmd", "pg_isready -U rehearsal -d rehearsal", "--health-interval=1s",
             "--health-timeout=3s", "--health-retries=60", config["image"],
             "-c", "shared_buffers=32MB", "-c", "maintenance_work_mem=32MB"])
        import time
        for _ in range(90):
            state = run(["docker", "inspect", "--format", "{{.State.Health.Status}}", name]).decode().strip()
            if state == "healthy":
                break
            if state == "unhealthy":
                logs = sp.run(["docker", "logs", name], capture_output=True, text=True)
                # This container has received no production data yet.
                print((logs.stdout + logs.stderr)[-3000:], flush=True)
                raise RuntimeError("isolated PostgreSQL unhealthy")
            time.sleep(1)
        else:
            raise RuntimeError("isolated PostgreSQL startup timed out")
        # pg_dump excludes global roles; policies can still name source roles.
        # Placeholders exist only in this network-isolated disposable database.
        run(["docker", "exec", name, "psql", "-X", "-U", "rehearsal", "-d", "rehearsal",
             "-v", "ON_ERROR_STOP=1", "-c",
             "CREATE ROLE neondb_owner NOLOGIN; CREATE ROLE cabukpos NOLOGIN; CREATE ROLE apps NOLOGIN; CREATE ROLE cabukpos_app NOLOGIN;"])
        with path.open("rb") as source, open(os.devnull, "wb") as target:
            pipeline([crypt(True), ["docker", "exec", "-i", name, "pg_restore", "-U", "rehearsal",
                      "-d", "rehearsal", "--clean", "--if-exists", "--no-owner", "--no-acl", "--exit-on-error"]],
                     source=source, destination=target, env=env)
        sql = ("select case when (select count(*) from tenants)>0 "
               "and to_regclass('public.billing_invoices') is not null "
               "and to_regprocedure('public.report_due_tenants(text,timestamp with time zone)') is not null "
               "then 'OK' else 'INCOMPLETE' end;")
        result = run(["docker", "exec", name, "psql", "-X", "-U", "rehearsal", "-d", "rehearsal",
                      "-At", "-v", "ON_ERROR_STOP=1", "-c", sql]).decode().strip()
        if result != "OK":
            raise RuntimeError("restore smoke check incomplete")
        print(f"Restore verified: {path.name}; isolated PostgreSQL, required tables/functions present", flush=True)
        if release_dir is not None:
            from release_check import check_release
            check_release(name, work, release_dir)
    finally:
        # Only the ephemeral container created by this invocation is removed.
        run(["docker", "rm", "--force", name])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("job", choices=["backup", "restore", "release"])
    parser.add_argument("--config", default="/etc/cabukpos-ops/config.json")
    parser.add_argument("--release-dir", type=Path)
    args = parser.parse_args()
    if args.job == "release" and args.release_dir is None:
        parser.error("release requires --release-dir with a built, secret-free source snapshot")
    os.umask(0o077)
    config_path = Path(args.config)
    if config_path.stat().st_mode & 0o077:
        raise RuntimeError("config must have mode 0600")
    config = json.loads(config_path.read_text())
    if len(config["encryption_key"]) < 32:
        raise RuntimeError("backup encryption key too short")
    state = Path(config.get("state_dir", "/var/lib/cabukpos-ops"))
    backups = state / "backups"
    backups.mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        with (state / "maintenance.lock").open("w") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            env = {**os.environ, "CABUKPOS_BACKUP_KEY": config["encryption_key"]}
            with tempfile.TemporaryDirectory(prefix="job-", dir=state) as directory:
                work = Path(directory)
                if args.job == "backup":
                    backup(config, work, backups, env)
                else:
                    candidates = sorted(backups.glob("cabukpos-*.dump.enc"))
                    if not candidates:
                        raise RuntimeError("no encrypted backup available")
                    restore(config, work, candidates[-1], env,
                            args.release_dir.resolve() if args.job == "release" else None)
            status = {"job": args.job, "ok": True, "completed_at": dt.datetime.now(dt.timezone.utc).isoformat()}
            (state / (args.job + "-status.json")).write_text(json.dumps(status) + "\n")
    except Exception as error:
        detail = str(error) if type(error) is RuntimeError else type(error).__name__
        notify(config, f"cabukpos-{args.job}-failed", {"job": args.job, "error": detail})
        raise


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Connection strings/provider errors must never appear in journal output.
        detail = str(error) if type(error) is RuntimeError else type(error).__name__
        print(f"Maintenance failed: {detail}; success not recorded", flush=True)
        raise SystemExit(1)
