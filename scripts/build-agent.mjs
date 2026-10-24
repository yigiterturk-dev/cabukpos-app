import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function assertNoLegacyCrypto(metafile) {
  const rejected = Object.keys(metafile.inputs).filter((input) =>
    /(^|[/:\\])node-forge([/\\]|$)/.test(input) || /[/\\]crypto[/\\]forge\.js$/.test(input));
  if (rejected.length) throw new Error(`Legacy crypto is forbidden in the agent bundle: ${rejected.join(", ")}`);
}

export async function buildAgent({ write = true } = {}) {
  const license = await readFile(new URL("../vendor/acme-client-native/LICENSE", import.meta.url), "utf8");
  const outfile = resolve("public/indir/cabukpos-agent.cjs");
  const result = await build({
    entryPoints: ["agent/src/main.ts"], outfile, bundle: true, platform: "node", target: "node20", format: "cjs",
    minify: true, legalComments: "inline", alias: { "@": "." }, metafile: true, write: false,
    banner: { js: `/* Includes @cabukpos/acme-client-native, derived from acme-client 5.4.0.\n${license}\n*/` },
  });
  assertNoLegacyCrypto(result.metafile);
  if (write) {
    await mkdir(dirname(outfile), { recursive: true });
    await writeFile(outfile, result.outputFiles[0].contents);
    console.log(`Agent built: ${result.outputFiles[0].contents.length} bytes; no legacy forge inputs.`);
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildAgent();
