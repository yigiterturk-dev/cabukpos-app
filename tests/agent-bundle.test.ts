import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { buildAgent, assertNoLegacyCrypto } from "../scripts/build-agent.mjs";

test("ajan: gerçek bundle native ACME içerir, forge girdisi içermez ve MIT bildirimi taşır", async () => {
  const result = await buildAgent({ write: false });
  const inputs = Object.keys(result.metafile.inputs);
  assert.ok(inputs.some((p) => p.includes("acme-client-native/src/crypto/index.js")));
  assert.ok(inputs.every((p) => !p.includes("node-forge") && !p.endsWith("crypto/forge.js")));
  assert.ok(result.outputFiles[0].text.includes("Copyright (c) 2017-2024 Labrador CMS AS"));
});

test("ajan: eski kripto paketi tekrar girerse build kapısı reddeder", () => {
  for (const input of ["node_modules/node-forge/lib/rsa.js", "vendor/acme-client-native/src/crypto/forge.js", "node_modules\\node-forge\\lib\\rsa.js"]) {
    assert.throws(() => assertNoLegacyCrypto({ inputs: { [input]: {} } }), /Legacy crypto is forbidden/);
  }
});

test("native ACME: vendored dosyalar kaydedilen kaynak hash'leriyle eşleşir; lock dosyasında forge yok", async () => {
  const root = new URL("../vendor/acme-client-native/", import.meta.url);
  const provenance = JSON.parse(await readFile(new URL("UPSTREAM.json", root), "utf8"));
  for (const [name, value] of Object.entries(provenance.files)) {
    const hash = createHash("sha256").update(await readFile(new URL(name, root))).digest("hex");
    assert.equal(hash, (value as { sha256: string }).sha256, name);
  }
  const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
  assert.ok(Object.keys(lock.packages).every((p) => !p.endsWith("/node-forge") && !p.endsWith("/acme-client")));
});
