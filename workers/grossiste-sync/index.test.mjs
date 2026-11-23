import test from "node:test";
import assert from "node:assert/strict";
import worker from "./index.mjs";

const env = { SYNC_TOKEN: "test-token" };
const req = (path, method="GET", token=null) => new Request("https://sync.example"+path, { method, headers: token ? {authorization:"Bearer "+token} : {} });

test("health endpoint reports UBIPHARM-only read-only mode", async () => {
 const res=await worker.fetch(req("/health"),env); const data=await res.json();
 assert.equal(res.status,200); assert.equal(data.mode,"read-only-diagnostics"); assert.equal(data.provider,"ubipharm");
});
test("inspect endpoint requires token", async () => { const res=await worker.fetch(req("/inspect/ubipharm","POST"),env); assert.equal(res.status,401); });
test("authenticated inspection requires token", async () => { const res=await worker.fetch(req("/inspect/ubipharm/authenticated","POST"),env); assert.equal(res.status,401); });
test("unknown route rejected", async () => { const res=await worker.fetch(req("/inspect/other","POST","test-token")); assert.equal(res.status,404); });
test("missing browser binding returns safe configuration status", async () => { const res=await worker.fetch(req("/inspect/ubipharm","POST","test-token"),env); const data=await res.json(); assert.equal(res.status,503); assert.equal(data.status,"browser_binding_missing"); });
test("authenticated route requires configured credentials", async () => { const res=await worker.fetch(req("/inspect/ubipharm/authenticated","POST","test-token"),env); const data=await res.json(); assert.equal(res.status,503); assert.equal(data.status,"credentials_missing"); });
