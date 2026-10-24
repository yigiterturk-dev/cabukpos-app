# Native-only ACME client

Controlled local derivative of MIT-licensed `acme-client` 5.4.0 from
https://github.com/publishlab/node-acme-client. Not an official upstream release.

The upstream package imports its deprecated `forge` export unconditionally.
That adds the unpatched node-forge RSA verification advisory to the installed
dependency graph and the distributed agent, despite the agent using only the
modern native Node.js `crypto` API.

Changes from the recorded upstream tarball:

- omit `src/crypto/forge.js` and its node-forge dependency;
- remove the legacy root export and its TypeScript declarations;
- rename the local package and require Node 20+, matching the agent target;
- retain all native crypto, ACME client, DNS-01, HTTP-01, TLS-ALPN-01,
  retry, account and renewal implementations unchanged.

`UPSTREAM.json` records tarball provenance and per-file upstream/local SHA-256.
The original MIT license is retained and embedded in the agent build banner.
The build rejects any reintroduction of node-forge or the legacy crypto module.

Maintenance: monitor upstream acme-client releases/advisories; when rebasing,
record the new tarball and hashes, reapply only these removals, and run the
crypto/ACME, bundle, full application and LAN regression gates. Renaming a
package does not make npm audit a complete audit of this vendored source.
