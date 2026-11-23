const PORTAL="https://fournisseur-benin.ubipharm.com";
const LIMIT={launch:20000,navigation:45000,diagnostics:15000,close:5000};
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}})}
function authorized(r,e){return Boolean(e.SYNC_TOKEN&&r.headers.get("authorization")===`Bearer ${e.SYNC_TOKEN}`)}
function timed(p,ms,stage){let t;return Promise.race([p,new Promise((_,reject)=>t=setTimeout(()=>reject(Object.assign(new Error(`Timeout at ${stage} (${ms}ms)`),{code:`${stage}_timeout` })),ms))]).finally(()=>clearTimeout(t))}
async function diagnostics(page){return page.evaluate(()=>{const v=e=>!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length);const path=h=>{try{let u=new URL(h,location.href);return u.origin===location.origin?u.pathname:null}catch{return null}};
const headings=[...document.querySelectorAll("h1,h2,h3,h4")].filter(v).map(e=>(e.innerText||"").trim()).filter(Boolean).slice(0,30);
const links=[...document.querySelectorAll("a")].filter(v).slice(0,100).map(a=>({text:(a.innerText||a.textContent||"").trim().slice(0,100),path:path(a.href),href:a.href})).filter(a=>a.text&&a.path);
const tables=[...document.querySelectorAll("table")].filter(v).map((t,i)=>({index:i+1,headers:[...t.querySelectorAll("thead th,thead td,tr:first-child th,tr:first-child td")].map(e=>(e.innerText||e.textContent||"").trim()).filter(Boolean).slice(0,30),rowCount:Math.max(0,t.querySelectorAll("tbody tr").length||t.querySelectorAll("tr").length-1)})).slice(0,20);
const inputs=[...document.querySelectorAll("input,select,textarea")].filter(v).map(e=>({type:e.type||e.tagName.toLowerCase(),name:e.name||"",id:e.id||"",placeholder:e.placeholder||"",label:e.labels?.[0]?.innerText?.trim()||""})).slice(0,30);
const forms=[...document.querySelectorAll("form")].filter(v).map(f=>({actionPath:path(f.action),method:(f.method||"get").toUpperCase(),fields:[...f.querySelectorAll("input,select,textarea")].map(e=>e.name||e.id||e.type).filter(Boolean)})).slice(0,10);
const txt=(document.body?.innerText||"").toLowerCase();return{title:document.title,url:location.href,headings,links,tables,inputs,forms,loginVisible:[...document.querySelectorAll('input[type="password"]')].some(v),verificationRequired:/captcha|code de vérification|verification code|otp|authentification à deux facteurs|two.factor/.test(txt),pageTextSignals:["vente","statistique","laboratoire","produit","commande","facture","export","rapport","historique","dashboard"].filter(w=>txt.includes(w))}})}
async function extractPage(page){return page.evaluate(()=>{const visible=e=>!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length);const tables=[...document.querySelectorAll("table")].filter(visible).map((t,index)=>{const rows=[...t.querySelectorAll("tr")].filter(visible).map(tr=>[...tr.querySelectorAll("th,td")].map(td=>(td.innerText||td.textContent||"").trim().replace(/\\s+/g," ").slice(0,500))).filter(r=>r.length);return{index:index+1,headers:rows[0]||[],rows:rows.slice(1,501),truncated:rows.length>501}}).filter(t=>t.rows.length);
const text=(document.body?.innerText||"").trim().slice(0,12000);
const links=[...document.querySelectorAll("a")].filter(visible).map(a=>({text:(a.innerText||a.textContent||"").trim().slice(0,120),url:a.href})).filter(a=>a.text&&/^https?:/.test(a.url)).slice(0,100);
const downloads=[...document.querySelectorAll("a[href],button")].filter(visible).map(e=>({label:(e.innerText||e.textContent||"").trim().slice(0,120),url:e.href||"",download:e.getAttribute("download")||"",type:e.getAttribute("type")||""})).filter(x=>/pdf|csv|excel|export|télécharg|download|rapport/i.test(x.label+" "+x.url+" "+x.download)).slice(0,50);
return{url:location.href,title:document.title,text,tables,links,downloadCandidates:downloads}})}
async function login(page,env){const login=page.locator('input[name="Login"], input[placeholder="Login"], input[name="login"], input[type="text"]').first(),pass=page.locator('input[name="Password"], input[type="password"]').first();
if(!(await timed(login.count(),8000,"login_form"))||!(await timed(pass.count(),8000,"login_form")))return{ok:false,reason:"login_form_not_found"};
await timed(login.fill(env.UBIPHARM_USERNAME),10000,"login_fill");await timed(pass.fill(env.UBIPHARM_PASSWORD),10000,"login_fill");
const submit=page.locator('form button[type="submit"], form input[type="submit"], button:has-text("Se connecter"), button:has-text("Login")').first();
if(await timed(submit.count(),8000,"login_submit"))await timed(submit.click({timeout:10000}),12000,"login_submit");else await timed(page.locator("form").first().evaluate(f=>f.requestSubmit()),10000,"login_submit");
try{await timed(page.waitForLoadState("domcontentloaded",{timeout:12000}),13000,"post_login")}catch{}await timed(page.waitForTimeout(2500),4000,"post_login");
const d=await timed(diagnostics(page),LIMIT.diagnostics,"post_login_diagnostics");
if(d.verificationRequired)return{ok:false,reason:"verification_required",diagnostics:d};
if(d.loginVisible)return{ok:false,reason:"login_failed_or_rejected",diagnostics:d};
return{ok:true,diagnostics:d}}
export default{async scheduled(controller,env,ctx){ctx.waitUntil(dailyCollection(env).catch(e=>console.error(JSON.stringify({event:"grossiste_daily_sync_failed",message:String(e)}))))},async fetch(request,env){const url=new URL(request.url);if(request.method==="GET"&&url.pathname==="/health")return json({service:"provisit-grossiste-sync",status:"ok",mode:"read-only-portal-extraction",provider:"ubipharm"});
const route=url.pathname.replace(/\/+$/,"")||"/";if(request.method!=="POST"||!["/inspect/ubipharm","/inspect/ubipharm/authenticated","/extract/ubipharm"].includes(route))return json({error:"Not found"},404);
if(!authorized(request,env))return json({error:"Unauthorized"},401);if(route!=="/inspect/ubipharm"&&(!env.UBIPHARM_USERNAME||!env.UBIPHARM_PASSWORD))return json({status:"credentials_missing"},503);if(!env.BROWSER)return json({status:"browser_binding_missing"},503);
let browser,stage="browser_launch",started=Date.now();try{const{launch}=await import("@cloudflare/playwright");browser=await timed(launch(env.BROWSER),LIMIT.launch,stage);stage="new_page";const page=await timed(browser.newPage(),10000,stage);page.setDefaultNavigationTimeout(LIMIT.navigation);stage="navigation";await timed(page.goto(PORTAL,{waitUntil:"domcontentloaded",timeout:LIMIT.navigation}),LIMIT.navigation+3000,stage);stage="initial_wait";await timed(page.waitForTimeout(1200),3000,stage);
if(route!=="/inspect/ubipharm"){stage="login";const auth=await login(page,env);if(!auth.ok)return json({provider:"ubipharm",status:auth.reason,diagnostics:auth.diagnostics||await timed(diagnostics(page),LIMIT.diagnostics,"diagnostics"),elapsedMs:Date.now()-started},auth.reason==="verification_required"?409:502);
if(route==="/inspect/ubipharm/authenticated")return json({provider:"ubipharm",status:"authenticated_page_inspected",diagnostics:auth.diagnostics,elapsedMs:Date.now()-started});
stage="extract_current_page";const current=await timed(extractPage(page),LIMIT.diagnostics,stage);
const pages=[current],visited=new Set([new URL(page.url()).pathname]);
const candidateLinks=auth.diagnostics.links.filter(l=>["/StatsVentes","/StatsVentesPDF","/Achats"].includes(l.path));
for(const link of candidateLinks){if(visited.has(link.path)||pages.length>=4)continue;visited.add(link.path);stage="navigate_"+link.path;try{await timed(page.goto(new URL(link.path,PORTAL).href,{waitUntil:"domcontentloaded",timeout:LIMIT.navigation}),LIMIT.navigation+3000,stage);await timed(page.waitForTimeout(700),2000,"page_wait");pages.push(await timed(extractPage(page),LIMIT.diagnostics,"page_extract"));}catch(e){pages.push({url:new URL(link.path,PORTAL).href,error:String(e).slice(0,200)});}}
return json({provider:"ubipharm",status:"extraction_preview",mode:"read-only",authenticationStatus:"confirmed_by_session_check",authenticated:true,source:PORTAL,extractedAt:new Date().toISOString(),pages,diagnostics:auth.diagnostics,reviewRequired:true,imported:false,elapsedMs:Date.now()-started});
}
stage="diagnostics";const d=await timed(diagnostics(page),LIMIT.diagnostics,stage);return json({provider:"ubipharm",status:"portal_inspected",diagnostics:d,elapsedMs:Date.now()-started})
}catch(error){return json({provider:"ubipharm",status:error?.code||(String(error).includes("429")?"browser_rate_limit":"browser_error"),stage,error:String(error).slice(0,400),elapsedMs:Date.now()-started},502)}finally{if(browser)try{await timed(browser.close(),LIMIT.close,"browser_close")}catch{}}}};

const UBIPHARM_ID="c7af99dc-93fd-4c93-a5d8-504ebcb4cba8";
function beninDateParts(d=new Date()){return new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Porto-Novo",year:"numeric",month:"2-digit",day:"2-digit"}).format(d)}
function monthStart(date){return date.slice(0,7)+"-01"}
export function parseUbipharmRows(payload){
 const out=[];
 for(const pg of payload?.pages||[]){
  for(const table of pg.tables||[]){
   const h=(table.headers||[]).map(x=>String(x).trim().toLowerCase());
   const productIdx=h.findIndex(x=>x==="produit");
   const saleIdx=h.findIndex(x=>x==="vente mois");
   if(productIdx<0||saleIdx<0)continue;
   for(const row of table.rows||[]){
    const cell=String(row[productIdx]||"");
    const code=(cell.match(/(?:^|\n)([0-9]{5,14})\s*$/)||cell.match(/([0-9]{5,14})\s*$/))?.[1];
    const name=cell.replace(/\n[0-9]{5,14}\s*$/,"").trim();
    const qty=Number(String(row[saleIdx]||"").replace(/\\s/g,"").replace(",","."));
    if(code&&name&&Number.isFinite(qty)&&qty>=0)out.push({code_externe:code,produit_source:name,cumul_mois:qty,raw_row:row});
   }
  }
 }
 return out;
}
async function persistSnapshots(env,rows,capturedDate,month){
 if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)throw new Error("supabase_secrets_missing");
 if(!rows.length)throw new Error("no_sales_rows_parsed");
 const url=env.SUPABASE_URL.replace(/\/$/,"")+"/rest/v1/grossiste_ventes_snapshots?on_conflict=grossiste_id,code_externe,mois_reference,date_capture";
 const body=rows.map(r=>({grossiste_id:UBIPHARM_ID,code_externe:r.code_externe,produit_source:r.produit_source,mois_reference:month,date_capture:capturedDate,cumul_mois:r.cumul_mois,raw_row:{row:r.raw_row}}));
 const res=await fetch(url,{method:"POST",headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,authorization:"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY,"content-type":"application/json",Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(body)});
 if(!res.ok)throw new Error("supabase_write_failed_"+res.status+"_"+(await res.text()).slice(0,250));
 return body.length;
}
async function dailyCollection(env){
 const date=beninDateParts();const month=monthStart(date);
 const base=env.WORKER_URL||"https://provisit-grossiste-sync.ccds22431.workers.dev";
 const res=await fetch(base+"/extract/ubipharm",{method:"POST",headers:{authorization:"Bearer "+env.SYNC_TOKEN,"content-type":"application/json"},body:"{}"});
 if(!res.ok)throw new Error("extract_http_"+res.status);
 const payload=await res.json();
 if(!payload.authenticated||payload.authenticationStatus!=="confirmed_by_session_check")throw new Error("authentication_not_confirmed");
 const rows=parseUbipharmRows(payload);
 const count=await persistSnapshots(env,rows,date,month);
 console.log(JSON.stringify({event:"grossiste_daily_snapshot",provider:"ubipharm",date_capture:date,month,rows_saved:count}));
}
