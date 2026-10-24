"""Release SQL, data preservation, RLS and real Next.js readiness on a restored copy."""
import hashlib
import json
import re
import secrets
import subprocess as sp
import time
import uuid

from maintenance import run

NODE_IMAGE = "node@sha256:3ed98443660ff48413b5af19ecefce3b9d50845a901a43420d47cc63a9fddbe9"
COUNTS = """select json_build_array(
 (select count(*) from tenants), (select count(*) from users),
 (select count(*) from stores), (select count(*) from products),
 (select count(*) from sales), (select coalesce(sum(total),0) from sales),
 (select count(*) from stock_movements), (select coalesce(sum(qty_milli),0) from stock_movements)
)::text;"""


def release_transaction(migration_rls):
    totals = COUNTS.strip().removeprefix("select ").removesuffix(";")
    protected = "'category_station_routes','product_station_routes','stores','products','sales','stock_movements','stock_transfers','stock_transfer_lines','store_product_settings'"
    transaction = "BEGIN ISOLATION LEVEL REPEATABLE READ;\nSET LOCAL lock_timeout='5s';\nSET LOCAL statement_timeout='60s';\n"
    transaction += "SELECT pg_advisory_xact_lock(20261024,1);\nCREATE TEMP TABLE cabukpos_release_before ON COMMIT DROP AS SELECT " + totals + " AS totals;\n"
    transaction += migration_rls + "\nDO $gate$ BEGIN\nIF (SELECT totals FROM cabukpos_release_before) IS DISTINCT FROM (SELECT " + totals + ") THEN RAISE EXCEPTION 'release data totals changed'; END IF;\n"
    transaction += "IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN (" + protected + ") AND c.relrowsecurity AND c.relforcerowsecurity) <> 9 THEN RAISE EXCEPTION 'release forced RLS incomplete'; END IF;\nEND $gate$;\nCOMMIT;\n"
    return transaction


def check_release(database_container, work, source):
    def sql(statement):
        result = sp.run(["docker", "exec", "-i", database_container, "psql", "-X", "-U", "rehearsal",
                    "-d", "rehearsal", "-At", "-v", "ON_ERROR_STOP=1",
                    *([] if statement.startswith("BEGIN ") else ["--single-transaction"])],
                   input=statement.encode(), capture_output=True)
        if result.returncode:
            # Static schema diagnostics only; never print failing row data or SQL input.
            text = result.stderr.decode(errors="replace")
            matches = re.findall(r'(?:column|relation|role|type) "[a-zA-Z0-9_.]+" (?:does not exist|already exists)', text)
            raise RuntimeError("release SQL failed; schema hints=" + ",".join(matches))
        return result.stdout.decode().strip()

    migration = (source / "db/releases/2026-10-24-hq-stock.sql").read_text()
    rls = (source / "db/rls.sql").read_text()
    build_id = (source / ".next/BUILD_ID").read_text().strip()
    if not (source / "node_modules/next/dist/bin/next").is_file():
        raise RuntimeError("release snapshot requires installed dependencies")
    if any(source.glob(".env.local")) or any(source.glob(".env.production*")):
        raise RuntimeError("release snapshot must not contain production environment files")
    inventory = sql("select coalesce(json_agg(json_build_object('table',table_name,'column',column_name,"
                    "'type',udt_name,'nullable',is_nullable) order by table_name,ordinal_position),'[]'::json)::text "
                    "from information_schema.columns where table_schema='public';")
    (work.parent / "release-schema-inventory.json").write_text(inventory + "\n")
    before = sql(COUNTS)
    for _ in range(2):
        sql(release_transaction(migration + "\n" + rls))
        if sql(COUNTS) != before:
            raise RuntimeError("release migration changed existing counts/totals")
    print("Release SQL + RLS: transaction and repeat application passed; data counts/totals preserved", flush=True)

    protected = ["category_station_routes", "product_station_routes", "stores", "products", "sales", "stock_movements", "stock_transfers",
                 "stock_transfer_lines", "store_product_settings"]
    flags = sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace "
                "where n.nspname='public' and c.relname in (" + ",".join("'"+t+"'" for t in protected) +
                ") and c.relrowsecurity and c.relforcerowsecurity;")
    if flags != str(len(protected)):
        raise RuntimeError("release tables lack forced RLS")
    role = sql("select (not rolsuper and not rolbypassrls)::text from pg_roles where rolname='cabukpos_app';")
    if role != "true":
        raise RuntimeError("application role can bypass RLS")
    # No tenant context and an unrelated tenant must expose no business rows.
    queries = "\n".join(f"select count(*) from {table};" for table in protected)
    for context in ("", str(uuid.uuid4())):
        result = sql("set local role cabukpos_app; select set_config('app.tenant_id', '" + context + "', true);\n" + queries)
        if result.splitlines()[-len(protected):] != ["0"] * len(protected):
            raise RuntimeError("tenant context leaked business rows")
    tenant = str(uuid.UUID(sql("select id from tenants order by id limit 1;")))
    scoped = "\n".join(f"select count(*) from {table} where tenant_id='{tenant}'::uuid;" for table in protected)
    expected = sql(scoped).splitlines()
    actual = sql("set local role cabukpos_app; select set_config('app.tenant_id', '" + tenant + "', true);\n" + queries)
    if actual.splitlines()[-len(protected):] != expected:
        raise RuntimeError("tenant-scoped row visibility mismatch")
    print("RLS: app role cannot bypass policies; absent/unrelated tenant blocked; own tenant counts match", flush=True)

    app_name = "cabukpos-release-app-" + secrets.token_hex(8)
    password = secrets.token_hex(32)
    sql("ALTER ROLE cabukpos_app LOGIN PASSWORD '" + password + "' NOSUPERUSER NOBYPASSRLS;")
    app_env = work / "app.env"
    app_env.write_text("DATABASE_URL=postgres://cabukpos_app:" + password + "@127.0.0.1:5432/rehearsal\n"
                       "AUTH_SECRET=" + secrets.token_hex(32) + "\nCRON_SECRET=" + secrets.token_hex(32) +
                       "\nAPP_URL=http://127.0.0.1:3199\nNODE_ENV=production\nNEXT_TELEMETRY_DISABLED=1\n")
    app_env.chmod(0o600)
    try:
        # Share the network namespace of the network=none database; no host port.
        run(["docker", "run", "--detach", "--pull=never", "--name", app_name,
             "--network", "container:" + database_container, "--memory=768m", "--cpus=0.5", "--pids-limit=128",
             "--cap-drop=ALL", "--security-opt=no-new-privileges", "--read-only",
             "--tmpfs", "/tmp:rw,nosuid,size=64m", "--env-file", str(app_env),
             "--mount", f"type=bind,src={source},dst=/app,readonly", "-w", "/app", NODE_IMAGE,
             "node", "node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3199"])
        probe = ("fetch('http://127.0.0.1:3199/api/ready').then(async r=>{const b=await r.json();"
                 "process.exit(r.status===200&&b.ok===true&&b.checks?.database==='ok'?0:1)})"
                 ".catch(()=>process.exit(1))")
        for _ in range(60):
            result = sp.run(["docker", "exec", app_name, "node", "-e", probe], stdout=sp.DEVNULL, stderr=sp.DEVNULL)
            if result.returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError("release application readiness failed")
        audit = run(["docker", "exec", "-e", "BASE=http://127.0.0.1:3199", app_name,
                     "node", "scripts/runtime-audit.mjs"]).decode()
        if "PASS" not in audit:
            raise RuntimeError("runtime audit did not report PASS")
        print("Application: production Next.js ready with app DB role; runtime audit PASS", flush=True)
        (work.parent / "release-evidence.json").write_text(json.dumps({
            "source_snapshot": source.name, "build_id": build_id,
            "migration_rls_sha256": hashlib.sha256((migration + "\n" + rls).encode()).hexdigest(),
            "migration_repeated": True, "counts_totals_preserved": True,
            "forced_rls_tables": len(protected), "tenant_visibility_verified": True,
            "readiness": True, "runtime_audit": "PASS", "external_network": False,
        }, indent=2) + "\n")
    finally:
        run(["docker", "rm", "--force", app_name])
