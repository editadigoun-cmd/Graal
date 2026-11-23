import test from "node:test";
import assert from "node:assert/strict";
import worker, { safeProviderName, PROVIDERS } from "./index.mjs";

const env = { SYNC_TOKEN: "test-token" };
const req = (path, method="GET", token=null) => new Request("https://sync.example"+path, { method, headers: token ? {authorization:"Bearer "+token} : {} });

test("health is public and read-only diagnostics", async () => {
 const res=await worker.fetch(req("/health"),env); const data=await res.json();
 assert.equal(res.status,200); assert.equal(data.mode,"read-only-diagnostics"); assert.deepEqual(data.providers,Object.keys(PROVIDERS));
});
test("provider whitelist", () => { assert.equal(safeProviderName("ubipharm"),"ubipharm"); assert.equal(safeProviderName("../ubipharm"),null); });
test("inspect endpoint rejects missing auth", async () => { const res=await worker.fetch(req("/inspect/ubipharm","POST"),env); assert.equal(res.status,401); });
test("unknown provider rejected", async () => { const res=await worker.fetch(req("/inspect/unknown","POST","test-token"),env); assert.equal(res.status,400); });
test("non-UBIPHARM providers are disabled during this phase", async () => { const res=await worker.fetch(req("/inspect/laborex","POST","test-token"),env); assert.equal(res.status,403); });
test("missing browser binding is reported safely", async () => { const res=await worker.fetch(req("/inspect/ubipharm","POST","test-token"),env); const data=await res.json(); assert.equal(res.status,503); assert.equal(data.status,"browser_binding_missing"); });
