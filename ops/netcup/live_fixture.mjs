// Temporary live release accounts, created directly to avoid signup/invite mail.
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomUUID, randomBytes } from 'node:crypto';

const [mode, snapshot] = process.argv.slice(2);
if (!['create', 'cleanup'].includes(mode) || !snapshot) throw new Error('create|cleanup and snapshot directory required');
const require = createRequire(`${snapshot}/package.json`);
const postgres = require('postgres');
const bcrypt = require('bcryptjs');
const config = JSON.parse(await readFile('/etc/cabukpos-ops/config.json', 'utf8'));
const sql = postgres(config.database_url, { max: 1, ssl: { rejectUnauthorized: true }, onnotice: () => {} });
const path = '/var/lib/cabukpos-ops/live-fixture.json';
try {
  if (mode === 'create') {
    const tenantId = randomUUID();
    const fixture = { tenantId, name: `Release smoke ${tenantId}`, storeId: randomUUID(),
      otherStoreId: randomUUID(), password: randomBytes(32).toString('hex'),
      owner: `owner-${tenantId}@release.invalid`, branch: `branch-${tenantId}@release.invalid`,
      hq: `hq-${tenantId}@release.invalid` };
    // Exclusive marker is written first: cleanup remains possible after interruption.
    await writeFile(path, JSON.stringify(fixture), { mode: 0o600, flag: 'wx' });
    const hash = await bcrypt.hash(fixture.password, 12);
    await sql.begin(async tx => {
      await tx`insert into tenants(id,name,vertical) values(${tenantId},${fixture.name},'restoran')`;
      await tx`select set_config('app.tenant_id',${tenantId},true)`;
      await tx`insert into stores(id,tenant_id,name,kind) values
        (${fixture.storeId},${tenantId},'Release Şube A','sube'),
        (${fixture.otherStoreId},${tenantId},'Release Şube B','sube')`;
      await tx`insert into users(tenant_id,email,name,password_hash,role,store_id,email_verified_at) values
        (${tenantId},${fixture.owner},'Release Sahip',${hash},'sahip',null,now()),
        (${tenantId},${fixture.branch},'Release Şube Müdürü',${hash},'mudur',${fixture.storeId},now()),
        (${tenantId},${fixture.hq},'Release HQ',${hash},'mudur',null,now())`;
    });
    console.log('Temporary release tenant and three verified accounts created; no mail sent');
  } else {
    const fixture = JSON.parse(await readFile(path,'utf8'));
    await sql.begin(async tx => {
      const [tenant] = await tx`select name from tenants where id=${fixture.tenantId} for update`;
      if (tenant && tenant.name !== `Release smoke ${fixture.tenantId}`) throw new Error('Cleanup tenant marker mismatch');
      if (tenant) {
        await tx`delete from users where tenant_id=${fixture.tenantId}`;
        await tx`delete from tenants where id=${fixture.tenantId} and name=${fixture.name}`;
      }
      const [remaining] = await tx`select count(*)::int as n from tenants where id=${fixture.tenantId}`;
      if (remaining.n !== 0) throw new Error('Cleanup incomplete');
    });
    await unlink(path);
    console.log('Temporary release tenant/users/sessions removed; zero tenant rows remain');
  }
} finally {
  await sql.end();
}
