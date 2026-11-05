// Uses pre-verified, disposable accounts provisioned by ops/netcup/live_fixture.mjs.
// No signup, invites, email, payment or existing customer writes.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const base = process.env.BASE;
if (!base || !process.env.RELEASE_FIXTURE_FILE) throw new Error('BASE and RELEASE_FIXTURE_FILE required');
const fixture = JSON.parse(await readFile(process.env.RELEASE_FIXTURE_FILE,'utf8'));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const contexts = [];
async function login(email) {
  const context = await browser.newContext({ viewport: { width:1280,height:900 } });
  contexts.push(context);
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/giris`);
  await page.fill('input[name=email]',email);
  await page.fill('input[name=password]',fixture.password);
  await page.getByRole('button',{name:'Giriş yap',exact:true}).click();
  await page.waitForURL(`${base}/yonetim**`);
  return page;
}
try {
  const owner = await login(fixture.owner);
  await owner.goto(`${base}/yonetim/hq`);
  await owner.getByRole('heading',{name:'Zincir yönetimi',exact:true}).waitFor();
  await owner.getByText('Release Şube A',{exact:true}).filter({visible:true}).first().waitFor();
  await owner.getByText('Release Şube B',{exact:true}).filter({visible:true}).first().waitFor();
  console.log('PASS owner: authenticated HQ renders both branches');

  const branch = await login(fixture.branch);
  await branch.locator('[aria-label="Şubeniz: Release Şube A"]').first().waitFor();
  for (const path of ['/yonetim/hq','/yonetim/kullanicilar','/yonetim/franchise','/yonetim/subeler','/yonetim/veriler']) {
    await branch.goto(base+path);
    await branch.waitForURL(`${base}/yonetim`);
  }
  await branch.goto(`${base}/yonetim/stok`);
  await branch.getByRole('heading',{name:'Stok',level:1,exact:true}).waitFor();
  console.log('PASS branch manager: fixed branch, HQ/user/export pages blocked, stock accessible');

  const hq = await login(fixture.hq);
  await hq.goto(`${base}/yonetim/hq`);
  await hq.getByRole('heading',{name:'Zincir yönetimi',exact:true}).waitFor();
  await hq.goto(`${base}/yonetim/subeler`);
  await hq.getByText('Release Şube B',{exact:true}).filter({visible:true}).first().waitFor();
  console.log('PASS HQ manager: chain-wide branch view accessible');
  assert.equal(errors.length,0,'Browser page errors occurred');
  console.log('Authenticated release smoke PASS');
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
}
