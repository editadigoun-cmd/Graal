import test from "node:test";
import assert from "node:assert/strict";
import worker, { safeProviderName, PROVIDERS } from "./index.mjs";

const env = { SYNC_TOKEN: "test-token" };
const req = (path, method="GET", token=null) => new Request("https://sync.example"+path, { method, headers: token ? {authorization:"Bearer "+token} : {} });

test("health is public and explicitly read-only", async () => {
 const res=await worker.fetch(req("/health"),env); const data=await res.json();
 assert.equal(res.status,200); assert.equal(data.mode,"read-only"); assert.deepEqual(data.providers,Object.keys(PROVIDERS));
});
test("provider whitelist", () => { assert.equal(safeProviderName("laborex"),"laborex"); assert.equal(safeProviderName("../laborex"),null); });
test("test endpoint rejects missing auth", async () => { const res=await worker.fetch(req("/test/laborex","POST"),env); assert.equal(res.status,401); });
test("unknown provider rejected", async () => { const res=await worker.fetch(req("/test/unknown","POST","test-token"),env); assert.equal(res.status,400); });
test("missing credentials are reported without exposing values", async () => { const res=await worker.fetch(req("/test/laborex","POST","test-token"),env); const data=await res.json(); assert.equal(res.status,409); assert.equal(data.status,"needs_configuration"); });
