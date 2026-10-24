// tests/access.test.ts — HQ / şube müdürü yetki kapsamı kuralları.
import { test } from "node:test";
import assert from "node:assert/strict";
import { accessChangeProblem, assignProblem, canManageStores, canManageUsers, canUseStore, isBranchManager, resolveStore, seesAllStores } from "@/lib/core/access";

const S1 = "11111111-1111-1111-1111-111111111111";
const S2 = "22222222-2222-2222-2222-222222222222";
const owner = { role: "sahip" as const, storeId: null };
const hq = { role: "mudur" as const, storeId: null };
const branch = { role: "mudur" as const, storeId: S1 };

test("erişim: şube müdürü yalnız kendi şubesi", () => {
  assert.equal(isBranchManager(branch), true);
  assert.equal(isBranchManager(hq), false);
  assert.equal(isBranchManager(owner), false);
  assert.equal(canUseStore(branch, S1), true);
  assert.equal(canUseStore(branch, S2), false);
  assert.equal(canUseStore(branch, null), false);
  assert.equal(canUseStore(hq, S2), true);
  assert.equal(canUseStore(owner, S1), true);
});

test("erişim: şube müdürünün şubesi sabitlenir", () => {
  assert.equal(resolveStore(branch, S2), S1);
  assert.equal(resolveStore(branch, null), S1);
  assert.equal(resolveStore(hq, S2), S2);
  assert.equal(resolveStore(owner, null), null);
});

test("erişim: şube ve kullanıcı yönetimi yalnız tüm şubeleri görene açık", () => {
  assert.equal(seesAllStores(owner), true);
  assert.equal(seesAllStores(hq), true);
  assert.equal(seesAllStores(branch), false);
  assert.equal(canManageStores(branch), false);
  assert.equal(canManageUsers(branch), false);
  assert.equal(canManageUsers(hq), true);
});

test("erişim: rol ataması — sahip her şeyi, HQ yalnız şube müdürü", () => {
  assert.equal(assignProblem(owner, "sahip", null), null);
  assert.equal(assignProblem(owner, "mudur", null), null);
  assert.equal(assignProblem(owner, "mudur", S1), null);
  assert.equal(assignProblem(hq, "mudur", S1), null);
  assert.equal(assignProblem(hq, "mudur", null), "forbidden");
  assert.equal(assignProblem(hq, "sahip", null), "forbidden");
  assert.equal(assignProblem(branch, "mudur", S1), "forbidden");
  assert.equal(assignProblem(owner, "kasiyer", null), "role");
  assert.equal(assignProblem(owner, "sahip", S1), "store");
});

test("erişim: hesap değişikliği kendini kilitlemez, sahibi yalnız sahip düzenler", () => {
  const target = { id: "u1", role: "mudur" as const, storeId: S1 };
  assert.equal(accessChangeProblem(owner, target, { role: "mudur", storeId: S2 }), null);
  assert.equal(accessChangeProblem(owner, { ...target, id: "u2", role: "sahip" }, { role: "mudur", storeId: S2 }), null);
  assert.equal(accessChangeProblem(hq, { ...target, id: "u2", role: "sahip" }, { role: "mudur", storeId: S2 }), "forbidden");
  assert.equal(accessChangeProblem(hq, { ...target, id: "u2", storeId: null }, { role: "mudur", storeId: S2 }), "forbidden");
  assert.equal(accessChangeProblem(hq, { ...target, id: "u2" }, { role: "mudur", storeId: null }), "forbidden");
  assert.equal(accessChangeProblem(owner, { ...target, id: "u3" }, { role: "mudur", storeId: null }), null);
  assert.equal(accessChangeProblem(owner, { ...target, id: "u3", role: "sahip" }, { role: "mudur", storeId: S2 }), null);
  assert.equal(accessChangeProblem({ ...owner, id: "me" }, { ...target, id: "me", role: "sahip" }, { role: "mudur", storeId: S2 }), "self");
});
