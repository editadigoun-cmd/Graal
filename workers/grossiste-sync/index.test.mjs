import test from "node:test";
import assert from "node:assert/strict";
import worker, { parseUbipharmRows, parseUbipharmStockRows } from "./index.mjs";
const env = { SYNC_TOKEN: "test-token" };
const req = (path, method="GET", token=null) => new Request("https://sync.example"+path, { method, headers: token ? {authorization:"Bearer "+token} : {} });
test("health endpoint reports UBIPHARM read-only extraction mode", async () => { const res=await worker.fetch(req("/health"),env); const data=await res.json(); assert.equal(res.status,200); assert.equal(data.mode,"read-only-portal-extraction"); assert.equal(data.provider,"ubipharm"); });
test("inspect endpoint requires token", async () => { assert.equal((await worker.fetch(req("/inspect/ubipharm","POST"),env)).status,401); });
test("authenticated inspection requires token", async () => { assert.equal((await worker.fetch(req("/inspect/ubipharm/authenticated","POST"),env)).status,401); });
test("extract endpoint requires token", async () => { assert.equal((await worker.fetch(req("/extract/ubipharm","POST"),env)).status,401); });
test("unknown route rejected", async () => { assert.equal((await worker.fetch(req("/inspect/other","POST","test-token"))).status,404); });
test("missing browser binding returns safe configuration status", async () => { const res=await worker.fetch(req("/inspect/ubipharm","POST","test-token"),env); const data=await res.json(); assert.equal(res.status,503); assert.equal(data.status,"browser_binding_missing"); });
test("authenticated route requires configured credentials", async () => { const res=await worker.fetch(req("/inspect/ubipharm/authenticated","POST","test-token"),env); const data=await res.json(); assert.equal(res.status,503); assert.equal(data.status,"credentials_missing"); });
test("extract route requires configured credentials", async () => { const res=await worker.fetch(req("/extract/ubipharm","POST","test-token"),env); const data=await res.json(); assert.equal(res.status,503); assert.equal(data.status,"credentials_missing"); });

test("parses cumulative monthly sales rows from UBIPHARM stats table",()=>{
 const payload={pages:[{tables:[{headers:["","Etab","Produit","Nb mois stock","Stock","Cde en cours","Moy. ventes","Vente mois"],rows:[["","COO","PROTON 20MG GEL B/14\\n8036782","0.00","0","0","0","25"],["","COO","CINET 10MG B/40\\n8003191","3.0","0","0","1","31"]]}]}]};
 const rows=parseUbipharmRows(payload);
 assert.equal(rows.length,2);
 assert.deepEqual(rows.map(r=>[r.code_externe,r.cumul_mois]),[["8036782",25],["8003191",31]]);
});
test("ignores rows without product code or numeric cumulative value",()=>{
 const payload={pages:[{tables:[{headers:["Produit","Vente mois"],rows:[["A","4"],["B",""],["No code","2"]]}]}]};
 assert.equal(parseUbipharmRows(payload).length,0);
});

test("manual sync route rejects unauthenticated requests", async () => {
 const res=await worker.fetch(req("/sync/ubipharm","POST"),env);
 assert.equal(res.status,403);
 const data=await res.json();
 assert.equal(data.status,"forbidden");
});
test("manual sync route supports browser preflight", async () => {
 const res=await worker.fetch(req("/sync/ubipharm","OPTIONS"),env);
 assert.equal(res.status,204);
 assert.equal(res.headers.get("access-control-allow-origin"),"*");
});
test("parses stock, orders and monthly sales from UBIPHARM rows",()=>{
 const payload={pages:[{tables:[{headers:["Produit","Nb mois stock","Stock","Cde en cours","Moy. ventes","Vente mois"],rows:[["PROTON 20MG GEL B/14\\n8036782","2.5","18","4","7.2","25"]]}]}]};
 const rows=parseUbipharmStockRows(payload);
 assert.equal(rows.length,1);
 assert.deepEqual([rows[0].code_externe,rows[0].stock_quantity,rows[0].order_quantity,rows[0].cumulative_quantity],["8036782",18,4,25]);
});
