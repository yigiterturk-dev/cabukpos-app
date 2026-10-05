import { test } from "node:test";
import assert from "node:assert/strict";
import { getBillingProvider } from "@/lib/billing/provider";

test("fake abonelik sağlayıcısı production'da fail-closed olur", () => {
  const env = process.env as Record<string, string | undefined>;
  const before = { node: env.NODE_ENV, launch: env.LAUNCH_ENV, provider: env.BILLING_PROVIDER };
  try {
    env.BILLING_PROVIDER = "fake";
    env.NODE_ENV = "production";
    delete env.LAUNCH_ENV;
    assert.equal(getBillingProvider(), null);

    env.NODE_ENV = "test";
    env.LAUNCH_ENV = "production";
    assert.equal(getBillingProvider(), null);

    delete env.LAUNCH_ENV;
    assert.equal(getBillingProvider()?.name, "fake");
  } finally {
    if (before.node === undefined) delete env.NODE_ENV; else env.NODE_ENV = before.node;
    if (before.launch === undefined) delete env.LAUNCH_ENV; else env.LAUNCH_ENV = before.launch;
    if (before.provider === undefined) delete env.BILLING_PROVIDER; else env.BILLING_PROVIDER = before.provider;
  }
});
