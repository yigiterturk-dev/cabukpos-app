"""One ordered SQL bundle shared by isolated rehearsal and explicit live apply."""
import json
import re
from pathlib import Path

LEGACY_PROTECTED = ["category_station_routes", "product_station_routes", "stores", "products", "sales",
                    "stock_movements", "stock_transfers", "stock_transfer_lines", "store_product_settings"]


def unwrap_transaction(text):
    """Only remove a complete, outer BEGIN/COMMIT pair; never split the release gate."""
    lines = text.splitlines()
    markers = [(i, m.group(1).lower()) for i, line in enumerate(lines)
               if (m := re.fullmatch(r"\s*(begin|commit|rollback)\s*;\s*(?:--.*)?", line, re.I))]
    if not markers:
        return text
    meaningful = [i for i, line in enumerate(lines) if line.strip() and not line.lstrip().startswith("--")]
    if ([kind for _, kind in markers] != ["begin", "commit"] or
            markers[0][0] != meaningful[0] or markers[1][0] != meaningful[-1]):
        raise RuntimeError("migration must have one complete outer BEGIN/COMMIT pair")
    return "\n".join(line for i, line in enumerate(lines) if i not in {markers[0][0], markers[1][0]})


def load_bundle(source):
    source = Path(source).resolve()
    manifest = source / "ops/netcup/release-manifest.json"
    if not manifest.exists():
        paths = ["db/releases/2026-10-24-hq-stock.sql"]
        rls_path = "db/rls.sql"
    else:
        data = json.loads(manifest.read_text())
        paths, rls_path = data.get("migrations"), data.get("rls")
        if data.get("version") != 1 or not isinstance(paths, list) or not paths:
            raise RuntimeError("invalid release manifest")
        if any(not isinstance(p, str) for p in paths) or len(set(paths)) != len(paths):
            raise RuntimeError("duplicate or invalid migration path")
        if rls_path != "db/rls.sql":
            raise RuntimeError("release must include the canonical RLS script")
        if any(not re.fullmatch(r"db/releases/[a-z0-9-]+\.sql", p) for p in paths):
            raise RuntimeError("migration path outside release directory")

    def read(relative):
        path = (source / relative).resolve()
        if not path.is_relative_to(source) or not path.is_file():
            raise RuntimeError("missing or escaped release file")
        return path.read_text()

    rls = read(rls_path)
    protected = set()
    for block in re.findall(r"foreach\s+t\s+in\s+array\s+array\[([^\]]+)\]", rls, re.I):
        protected.update(re.findall(r"'([a-z_]+)'", block))
    protected.update(re.findall(r"alter table ([a-z_]+) enable row level security", rls, re.I))
    if manifest.exists() and not set(LEGACY_PROTECTED).issubset(protected):
        raise RuntimeError("canonical RLS coverage is incomplete")
    sql = "\n".join(unwrap_transaction(read(p)) for p in paths) + "\n" + rls
    return sql, sorted(protected) if manifest.exists() else LEGACY_PROTECTED, paths
