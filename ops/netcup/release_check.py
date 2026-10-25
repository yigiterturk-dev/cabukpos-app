"""Release SQL, data preservation, RLS and real Next.js readiness on a restored copy."""
import hashlib
import json
import re
import secrets
import subprocess as sp
import time
import uuid

from maintenance import run
from release_bundle import load_bundle, LEGACY_PROTECTED

NODE_IMAGE = "node@sha256:3ed98443660ff48413b5af19ecefce3b9d50845a901a43420d47cc63a9fddbe9"
COUNTS = """select json_build_array(
 (select count(*) from tenants), (select count(*) from users),
 (select count(*) from stores), (select count(*) from products),
 (select count(*) from sales), (select coalesce(sum(total),0) from sales),
 (select count(*) from stock_movements), (select coalesce(sum(qty_milli),0) from stock_movements)
)::text;"""


def release_transaction(migration_rls, protected_tables=None):
    totals = COUNTS.strip().removeprefix("select ").removesuffix(";")
    tables = protected_tables or LEGACY_PROTECTED
    if not all(re.fullmatch(r"[a-z_]+", t) for t in tables):
        raise RuntimeError("invalid protected table name")
    protected = ",".join("'" + t + "'" for t in tables)
    transaction = "BEGIN ISOLATION LEVEL REPEATABLE READ;\nSET LOCAL lock_timeout='5s';\nSET LOCAL statement_timeout='60s';\n"
    transaction += "SELECT pg_advisory_xact_lock(20261024,1);\nCREATE TEMP TABLE cabukpos_release_before ON COMMIT DROP AS SELECT " + totals + " AS totals;\n"
    transaction += """CREATE TEMP TABLE cabukpos_release_rows_before(table_name text,row_count bigint) ON COMMIT DROP;
DO $rows$ DECLARE t text; n bigint; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename LOOP
  EXECUTE format('select count(*) from public.%I',t) INTO n;
  INSERT INTO cabukpos_release_rows_before VALUES(t,n);
 END LOOP;
END $rows$;
"""
    transaction += migration_rls + "\nDO $gate$ BEGIN\nIF (SELECT totals FROM cabukpos_release_before) IS DISTINCT FROM (SELECT " + totals + ") THEN RAISE EXCEPTION 'release data totals changed'; END IF;\n"
    transaction += "IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN (" + protected + ") AND c.relrowsecurity AND c.relforcerowsecurity) <> " + str(len(tables)) + " THEN RAISE EXCEPTION 'release forced RLS incomplete'; END IF;\nEND $gate$;\n"
    transaction += """DO $rows$ DECLARE r record; n bigint; BEGIN
 FOR r IN SELECT * FROM cabukpos_release_rows_before LOOP
  EXECUTE format('select count(*) from public.%I',r.table_name) INTO n;
  IF n<>r.row_count THEN RAISE EXCEPTION 'release changed an existing table row count'; END IF;
 END LOOP;
END $rows$;
COMMIT;
"""
    return transaction


def check_release(database_container, work, source):
    def sql(statement, expect_abort=False):
        result = sp.run(["docker", "exec", "-i", database_container, "psql", "-X", "-U", "rehearsal",
                    "-d", "rehearsal", "-At", "-v", "ON_ERROR_STOP=1",
                    *([] if statement.startswith("BEGIN ") else ["--single-transaction"])],
                   input=statement.encode(), capture_output=True)
        if expect_abort:
            if not result.returncode or "cabukpos_rehearsal_abort" not in result.stderr.decode(errors="replace"):
                raise RuntimeError("expected migration abort was not reached")
            return "ABORT_VERIFIED"
        if result.returncode:
            # Static schema diagnostics only; never print failing row data or SQL input.
            text = result.stderr.decode(errors="replace")
            matches = re.findall(r'(?:column|relation|role|type) "[a-zA-Z0-9_.]+" (?:does not exist|already exists)', text)
            raise RuntimeError("release SQL failed; schema hints=" + ",".join(matches))
        return result.stdout.decode().strip()

    migration, protected, migrations = load_bundle(source)
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
    fingerprint_query = """select md5(json_build_object(
 'columns',(select json_agg(row(table_name,column_name,udt_name,is_nullable,column_default) order by table_name,ordinal_position) from information_schema.columns where table_schema='public'),
 'indexes',(select json_agg(row(tablename,indexname,indexdef) order by tablename,indexname) from pg_indexes where schemaname='public'),
 'policies',(select json_agg(row(tablename,policyname,roles,cmd,qual,with_check) order by tablename,policyname) from pg_policies where schemaname='public'),
 'flags',(select json_agg(row(c.relname,c.relrowsecurity,c.relforcerowsecurity) order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'),
 'enums',(select json_agg(row(t.typname,e.enumlabel,e.enumsortorder) order by t.typname,e.enumsortorder) from pg_enum e join pg_type t on t.oid=e.enumtypid join pg_namespace n on n.oid=t.typnamespace where n.nspname='public'),
 'functions',(select json_agg(row(p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid)) order by p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f')
)::text);"""
    before_schema = sql(fingerprint_query)
    abort = "\nDO $abort$ BEGIN RAISE EXCEPTION 'cabukpos_rehearsal_abort'; END $abort$;\n"
    sql(release_transaction(migration + abort, protected), expect_abort=True)
    if sql(COUNTS) != before or sql(fingerprint_query) != before_schema:
        raise RuntimeError("failed migration did not restore schema and financial totals")
    print("Rollback: injected migration failure restored original schema and financial totals", flush=True)
    for _ in range(2):
        sql(release_transaction(migration, protected))
        if sql(COUNTS) != before:
            raise RuntimeError("release migration changed existing counts/totals")
    print("Release SQL + RLS: transaction and repeat application passed; data counts/totals preserved", flush=True)

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
    scoped = "\n".join(
        f"select count(*) from {table} where " +
        (f"brand_id in (select id from brands where tenant_id='{tenant}'::uuid)" if table == "brand_products"
         else f"tenant_id='{tenant}'::uuid") + ";" for table in protected)
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
        row_counts = """CREATE TEMP TABLE fixture_rows(t text,n bigint) ON COMMIT DROP;
DO $rows$ DECLARE t text; n bigint; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename LOOP
  EXECUTE format('select count(*) from public.%I',t) INTO n;
  INSERT INTO fixture_rows VALUES(t,n);
 END LOOP;
END $rows$;
SELECT json_object_agg(t,n ORDER BY t)::text FROM fixture_rows;"""
        fixture_before = sql(row_counts).splitlines()[-1]
        smoke_result = sp.run(["docker", "exec", "-e", "BASE=http://127.0.0.1:3199", "-e", "RELEASE_REHEARSAL=isolated",
                     app_name, "node", "--experimental-strip-types", "--import", "./tests/ts-resolve.mjs",
                     "ops/netcup/release_smoke.mjs"], capture_output=True)
        smoke = smoke_result.stdout.decode(errors="replace")
        if smoke_result.returncode:
            hints = [line for line in smoke.splitlines() if line.startswith(("Release stage:", "Release failure:"))]
            raise RuntimeError("release workflow failed; " + " / ".join(hints)[-1500:])
        if "Release workflows PASS" not in smoke:
            raise RuntimeError("release business workflow checks failed")
        print("Release business workflows: partial receipts, expiry, PIN attendance, bookings, transfers and tenant scope PASS", flush=True)
        if sql(COUNTS) != before or sql(row_counts).splitlines()[-1] != fixture_before:
            raise RuntimeError("workflow fixture cleanup did not preserve source counts/totals")
        (work.parent / "release-evidence.json").write_text(json.dumps({
            "source_snapshot": source.name, "build_id": build_id,
            "migration_rls_sha256": hashlib.sha256(migration.encode()).hexdigest(), "migrations": migrations,
            "migration_repeated": True, "counts_totals_preserved": True,
            "migration_failure_rollback": True, "business_workflows": "PASS", "fixture_cleanup_verified": True,
            "forced_rls_tables": len(protected), "tenant_visibility_verified": True,
            "readiness": True, "runtime_audit": "PASS", "external_network": False,
        }, indent=2) + "\n")
    finally:
        run(["docker", "rm", "--force", app_name])
