const PORTAL="https://fournisseur-benin.ubipharm.com";
const PROMO_PORTAL="https://service16co.eurapharma.com/cgiphl/pw_call.pgm?PGMA=VID020";
const LIMIT={launch:20000,navigation:45000,diagnostics:15000,close:5000};
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...CORS}})}
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
async function promoLogin(page,env){
 const user=page.locator('input[name="name1"]').first();
 const pass=page.locator('input[name="name2"]').first();
 if(!(await timed(user.count(),8000,"promo_login_form"))||!(await timed(pass.count(),8000,"promo_login_form")))return{ok:false,reason:"promo_login_form_not_found",diagnostics:await timed(diagnostics(page),LIMIT.diagnostics,"promo_login_diagnostics")};
 await timed(user.fill(env.PROMO_USERNAME),10000,"promo_login_fill");
 await timed(pass.fill(env.PROMO_PASSWORD),10000,"promo_login_fill");
 const form=page.locator("form").first();
 await timed(form.evaluate(f=>f.requestSubmit()),12000,"promo_login_submit");
 try{await timed(page.waitForLoadState("domcontentloaded",{timeout:15000}),16000,"promo_post_login")}catch{}
 await timed(page.waitForTimeout(2200),4000,"promo_post_login_wait");
 const d=await timed(diagnostics(page),LIMIT.diagnostics,"promo_post_login_diagnostics");
 if(d.verificationRequired)return{ok:false,reason:"verification_required",diagnostics:d};
 if(d.loginVisible)return{ok:false,reason:"promo_login_failed_or_rejected",diagnostics:d};
 return{ok:true,diagnostics:d};
}
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
export default{async scheduled(controller,env,ctx){ctx.waitUntil(dailyCollection(env).catch(e=>console.error(JSON.stringify({event:"grossiste_daily_sync_failed",message:String(e)}))))},async fetch(request,env){const url=new URL(request.url);if(request.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});if(request.method==="GET"&&url.pathname==="/health")return json({service:"provisit-grossiste-sync",status:"ok",mode:"read-only-portal-extraction",provider:"ubipharm"});
const route=url.pathname.replace(/\/+$/,"")||"/";if(route==="/sync/ubipharm")return manualUbipharmSync(request,env);if(request.method!=="POST"||!["/inspect/ubipharm","/inspect/ubipharm/authenticated","/extract/ubipharm","/inspect/promo","/inspect/promo/authenticated"].includes(route))return json({error:"Not found"},404);
if(!authorized(request,env))return json({error:"Unauthorized"},401);if(route==="/inspect/promo/authenticated"&&(!env.PROMO_USERNAME||!env.PROMO_PASSWORD))return json({provider:"promo",status:"credentials_missing"},503);if(route!=="/inspect/promo"&&route!=="/inspect/promo/authenticated"&&route!=="/inspect/ubipharm"&&(!env.UBIPHARM_USERNAME||!env.UBIPHARM_PASSWORD))return json({status:"credentials_missing"},503);if(!env.BROWSER)return json({status:"browser_binding_missing"},503);
let browser,stage="browser_launch",started=Date.now();try{const{launch}=await import("@cloudflare/playwright");browser=await timed(launch(env.BROWSER),LIMIT.launch,stage);stage="new_page";const page=await timed(browser.newPage(),10000,stage);page.setDefaultNavigationTimeout(LIMIT.navigation);stage="navigation";await timed(page.goto(route==="/inspect/promo"?PROMO_PORTAL:PORTAL,{waitUntil:"domcontentloaded",timeout:LIMIT.navigation}),LIMIT.navigation+3000,stage);stage="initial_wait";await timed(page.waitForTimeout(1200),3000,stage);
if(route==="/inspect/promo"){const d=await timed(diagnostics(page),LIMIT.diagnostics,"promo_initial_diagnostics");return json({provider:"promo",status:"portal_inspected",mode:"read-only",source:PROMO_PORTAL,diagnostics:d,elapsedMs:Date.now()-started});}
if(route==="/inspect/promo/authenticated"){stage="promo_login";const auth=await promoLogin(page,env);if(!auth.ok)return json({provider:"promo",status:auth.reason,mode:"read-only",source:PROMO_PORTAL,diagnostics:auth.diagnostics,secondPasswordConfigured:Boolean(env.PROMO_SECOND_PASSWORD),elapsedMs:Date.now()-started},auth.reason==="verification_required"?409:502);const extracted=await timed(extractPage(page),LIMIT.diagnostics,"promo_extract_preview");return json({provider:"promo",status:"authenticated_page_inspected",mode:"read-only",source:PROMO_PORTAL,authenticated:true,diagnostics:auth.diagnostics,preview:extracted,secondPasswordConfigured:Boolean(env.PROMO_SECOND_PASSWORD),reviewRequired:true,imported:false,elapsedMs:Date.now()-started});}
if(route!=="/inspect/ubipharm"){stage="login";const auth=await login(page,env);if(!auth.ok)return json({provider:"ubipharm",status:auth.reason,diagnostics:auth.diagnostics||await timed(diagnostics(page),LIMIT.diagnostics,"diagnostics"),elapsedMs:Date.now()-started},auth.reason==="verification_required"?409:502);
if(route==="/inspect/ubipharm/authenticated")return json({provider:"ubipharm",status:"authenticated_page_inspected",diagnostics:auth.diagnostics,elapsedMs:Date.now()-started});
stage="extract_current_page";const current=await timed(extractPage(page),LIMIT.diagnostics,stage);
const pages=[current],visited=new Set([new URL(page.url()).pathname]);
const candidateLinks=auth.diagnostics.links.filter(l=>["/StatsVentes","/StatsVentesPDF","/Achats"].includes(l.path));
for(const link of candidateLinks){if(visited.has(link.path)||pages.length>=4)continue;visited.add(link.path);stage="navigate_"+link.path;try{await timed(page.goto(new URL(link.path,PORTAL).href,{waitUntil:"domcontentloaded",timeout:LIMIT.navigation}),LIMIT.navigation+3000,stage);await timed(page.waitForTimeout(700),2000,"page_wait");pages.push(await timed(extractPage(page),LIMIT.diagnostics,"page_extract"));}catch(e){pages.push({url:new URL(link.path,PORTAL).href,error:String(e).slice(0,200)});}}
return json({provider:"ubipharm",status:"extraction_preview",mode:"read-only",authenticationStatus:"confirmed_by_session_check",authenticated:true,source:PORTAL,extractedAt:new Date().toISOString(),pages,diagnostics:auth.diagnostics,reviewRequired:true,imported:false,elapsedMs:Date.now()-started});
}
stage="diagnostics";const d=await timed(diagnostics(page),LIMIT.diagnostics,stage);return json({provider:"ubipharm",status:"portal_inspected",diagnostics:d,elapsedMs:Date.now()-started})
}catch(error){return json({provider:route.includes("promo")?"promo":"ubipharm",status:error?.code||(String(error).includes("429")?"browser_rate_limit":"browser_error"),stage,error:String(error).slice(0,400),elapsedMs:Date.now()-started},502)}finally{if(browser)try{await timed(browser.close(),LIMIT.close,"browser_close")}catch{}}}};

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

const MANUAL_GROSSISTE_ID="c7af99dc-93fd-4c93-a5d8-504ebcb4cba8";
const CORS={"access-control-allow-origin":"*","access-control-allow-methods":"POST, OPTIONS","access-control-allow-headers":"authorization, content-type","access-control-max-age":"86400"};
async function sbRequest(env,path,options={}) {
 const base=env.SUPABASE_URL.replace(/\/$/,"");
 return fetch(base+path,{...options,headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,authorization:"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY,"content-type":"application/json",...(options.headers||{})}});
}
async function authorizeAdmin(request,env) {
 const bearer=request.headers.get("authorization")||"";
 const token=bearer.replace(/^Bearer\s+/i,"");
 if(!token||!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)return null;
 const userRes=await fetch(env.SUPABASE_URL.replace(/\/$/,"")+"/auth/v1/user",{headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,authorization:"Bearer "+token}});
 if(!userRes.ok)return null;
 const user=await userRes.json();
 if(!user?.id)return null;
 const profileRes=await sbRequest(env,"/rest/v1/profiles?select=role,actif&id=eq."+encodeURIComponent(user.id));
 if(!profileRes.ok)return null;
 const rows=await profileRes.json();
 return rows?.[0]?.role==="admin"&&rows?.[0]?.actif===true?user:null;
}
async function insertRun(env,values) {
 const res=await sbRequest(env,"/rest/v1/grossiste_sync_runs",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify(values)});
 if(!res.ok)throw new Error("run_create_failed_"+res.status+"_"+(await res.text()).slice(0,180));
 return (await res.json())[0];
}
async function patchRun(env,id,values) {
 const res=await sbRequest(env,"/rest/v1/grossiste_sync_runs?id=eq."+encodeURIComponent(id),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(values)});
 if(!res.ok)throw new Error("run_update_failed_"+res.status+"_"+(await res.text()).slice(0,180));
}
async function savePreviewPages(env,runId,pages) {
 if(!pages.length)return;
 const rows=pages.map((p,i)=>({sync_run_id:runId,page_order:i,page_url:p.url||PORTAL,page_title:p.title||"UBIPHARM",page_kind:"portal",extracted_payload:p,review_status:"pending"}));
 const res=await sbRequest(env,"/rest/v1/grossiste_sync_preview_pages",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify(rows)});
 if(!res.ok)throw new Error("preview_save_failed_"+res.status+"_"+(await res.text()).slice(0,180));
}
export function parseUbipharmStockRows(payload) {
 const out=[];
 for(const pg of payload?.pages||[])for(const table of pg.tables||[]) {
  const h=(table.headers||[]).map(x=>String(x).trim().toLowerCase());
  const productIdx=h.findIndex(x=>x==="produit");
  if(productIdx<0)continue;
  const idx=(names)=>h.findIndex(x=>names.includes(x));
  const stockIdx=idx(["stock","stock disponible"]);
  const orderIdx=idx(["cde en cours","commande en cours"]);
  const monthStockIdx=idx(["nb mois stock","mois de stock"]);
  const avgIdx=idx(["moy. ventes","moy ventes","moyenne ventes"]);
  const salesIdx=idx(["vente mois","ventes mois"]);
  for(const row of table.rows||[]) {
   const cell=String(row[productIdx]||"").trim();
   const match=cell.match(/(?:^|\n)([0-9]{5,14})\s*$/)||cell.match(/([0-9]{5,14})\s*$/);
   const code=match?.[1]; const designation=cell.replace(/\n[0-9]{5,14}\s*$/,"").trim();
   if(!code||!designation)continue;
   const number=(i)=>{if(i<0)return null;const raw=String(row[i]??"").replace(/[\s\u00a0]/g,"").replace(",",".");if(!raw)return null;const n=Number(raw);return Number.isFinite(n)?n:null};
   out.push({code_externe:code,designation_source:designation,stock_quantity:number(stockIdx),order_quantity:number(orderIdx),stock_months:number(monthStockIdx),average_month_sales:number(avgIdx),cumulative_quantity:number(salesIdx),source_row:row});
  }
 }
 return out;
}
async function persistStockRows(env,runId,rows) {
 if(!rows.length)return 0;
 const mapRes=await sbRequest(env,"/rest/v1/mappings_produits_grossistes?select=code_externe,produit_id&grossiste_id=eq."+MANUAL_GROSSISTE_ID);
 if(!mapRes.ok)throw new Error("mapping_read_failed_"+mapRes.status);
 const mappings=new Map((await mapRes.json()).map(x=>[String(x.code_externe).trim(),x.produit_id]));
 const reportMonth=monthStart(beninDateParts());
 const records=rows.map(r=>({sync_run_id:runId,grossiste_id:MANUAL_GROSSISTE_ID,produit_id:mappings.get(r.code_externe)||null,code_externe:r.code_externe,designation_source:r.designation_source,report_month:reportMonth,cumulative_quantity:r.cumulative_quantity,stock_quantity:r.stock_quantity,order_quantity:r.order_quantity,source_row:{portal_row:r.source_row,stock_months:r.stock_months,average_month_sales:r.average_month_sales},reviewed:false}));
 const res=await sbRequest(env,"/rest/v1/grossiste_sales_snapshots",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify(records)});
 if(!res.ok)throw new Error("stock_save_failed_"+res.status+"_"+(await res.text()).slice(0,220));
 return records.length;
}
async function manualUbipharmSync(request,env) {
 if(request.method!=="POST")return json({error:"Method not allowed"},405);
 const user=await authorizeAdmin(request,env);
 if(!user)return json({status:"forbidden",error:"Session administrateur invalide ou droits insuffisants."},403);
 if(!env.UBIPHARM_USERNAME||!env.UBIPHARM_PASSWORD)return json({status:"credentials_missing",error:"Identifiants UBIPHARM absents des secrets Cloudflare."},503);
 if(!env.BROWSER)return json({status:"browser_binding_missing"},503);
 const started=new Date().toISOString();
 let run=null,browser=null,stage="run_create";
 try {
  run=await insertRun(env,{grossiste_id:MANUAL_GROSSISTE_ID,source:"manual",status:"running",started_at:started,rows_found:0,rows_matched:0,rows_unmatched:0,summary:"Synchronisation UBIPHARM lancée depuis Provisit."});
  stage="browser_launch"; const {launch}=await import("@cloudflare/playwright"); browser=await timed(launch(env.BROWSER),LIMIT.launch,stage);
  stage="new_page"; const page=await timed(browser.newPage(),10000,stage); page.setDefaultNavigationTimeout(LIMIT.navigation);
  stage="portal_navigation"; await timed(page.goto(PORTAL,{waitUntil:"domcontentloaded",timeout:LIMIT.navigation}),LIMIT.navigation+3000,stage);
  await timed(page.waitForTimeout(1000),3000,"portal_wait");
  const initial=await timed(diagnostics(page),LIMIT.diagnostics,"initial_diagnostics");
  stage="portal_login"; const auth=await login(page,env);
  if(!auth.ok) {
   const detail=auth.diagnostics||await timed(diagnostics(page),LIMIT.diagnostics,"login_failure_diagnostics");
   await savePreviewPages(env,run.id,[{url:page.url(),title:"Diagnostic de connexion UBIPHARM",text:JSON.stringify({reason:auth.reason,initial,afterLogin:detail},null,2),tables:[],diagnostics:detail}]);
   await patchRun(env,run.id,{status:"needs_human",finished_at:new Date().toISOString(),error_code:auth.reason,error_message:"Session UBIPHARM non confirmée.",summary:"Connexion au portail non confirmée. Le diagnostic de connexion a été enregistré pour analyse.",metadata:{portal_authentication:"not_confirmed",reason:auth.reason,initial_diagnostics:initial,after_login:detail}});
   return json({status:auth.reason,run_id:run.id,error:"La connexion UBIPHARM n'a pas pu être confirmée. Le diagnostic est enregistré dans Provisit.",diagnostics:detail},502);
  }
  stage="protected_page_check";
  const statsLink=auth.diagnostics.links.find(l=>l.path==="/StatsVentes");
  if(statsLink) {
   await timed(page.goto(new URL(statsLink.path,PORTAL).href,{waitUntil:"domcontentloaded",timeout:LIMIT.navigation}),LIMIT.navigation+3000,stage);
   await timed(page.waitForTimeout(800),2500,"protected_page_wait");
  }
  const protectedDiagnostics=await timed(diagnostics(page),LIMIT.diagnostics,"protected_page_diagnostics");
  const stockPageVerified=protectedDiagnostics.tables.some(t=>{const headers=(t.headers||[]).map(h=>String(h).trim().toLowerCase());return headers.includes("produit")&&headers.includes("stock")&&headers.includes("vente mois")&&t.rowCount>0;});
  if(protectedDiagnostics.loginVisible||protectedDiagnostics.verificationRequired||!stockPageVerified) {
   await savePreviewPages(env,run.id,[{url:page.url(),title:"Vérification de session UBIPHARM",text:JSON.stringify(protectedDiagnostics,null,2),tables:[],diagnostics:protectedDiagnostics}]);
   await patchRun(env,run.id,{status:"needs_human",finished_at:new Date().toISOString(),error_code:"session_not_verified",summary:"La page protégée ne confirme pas l'accès aux données de stock (ou le formulaire de connexion réapparaît). Aucune donnée de stock n'a été enregistrée.",metadata:{portal_authentication:"not_confirmed",stock_page_verified:stockPageVerified,protected_page:protectedDiagnostics}});
   return json({status:"session_not_verified",run_id:run.id,error:"Le portail n'a pas conservé la session après connexion."},502);
  }
  stage="extract_pages"; const extracted=[await timed(extractPage(page),LIMIT.diagnostics,"extract_current_page")];
  const visited=new Set([new URL(page.url()).pathname]);
  for(const link of protectedDiagnostics.links.filter(l=>["/StatsVentes","/StatsVentesPDF","/Achats"].includes(l.path))) {
   if(visited.has(link.path)||extracted.length>=4)continue; visited.add(link.path);
   try {await timed(page.goto(new URL(link.path,PORTAL).href,{waitUntil:"domcontentloaded",timeout:LIMIT.navigation}),LIMIT.navigation+3000,"navigate_"+link.path);await timed(page.waitForTimeout(600),2000,"page_wait");extracted.push(await timed(extractPage(page),LIMIT.diagnostics,"page_extract"));}
   catch(e){extracted.push({url:new URL(link.path,PORTAL).href,title:"Page non extraite",text:"",tables:[],error:String(e).slice(0,220)});}
  }
  const rows=parseUbipharmStockRows({pages:extracted});
  stage="persist_preview"; await savePreviewPages(env,run.id,extracted);
  stage="persist_stock"; const saved=await persistStockRows(env,run.id,rows);
  const mapRes=await sbRequest(env,"/rest/v1/mappings_produits_grossistes?select=code_externe&grossiste_id=eq."+MANUAL_GROSSISTE_ID);
  const mappedCodes=mapRes.ok?new Set((await mapRes.json()).map(x=>String(x.code_externe).trim())):new Set();
  const matched=rows.filter(r=>mappedCodes.has(r.code_externe)).length;
  await patchRun(env,run.id,{status:"needs_human",finished_at:new Date().toISOString(),rows_found:rows.length,rows_matched:matched,rows_unmatched:Math.max(0,rows.length-matched),summary:"Connexion UBIPHARM confirmée. "+saved+" lignes de stock enregistrées en attente de revue administrateur.",metadata:{portal_authentication:"confirmed",stock_rows_saved:saved,pages_extracted:extracted.length,review_required:true,report_month_assigned:monthStart(beninDateParts())}});
  console.log(JSON.stringify({event:"ubipharm_manual_sync",run_id:run.id,authenticated:true,stock_rows:saved,stage:"completed"}));
  return json({status:"needs_human",run_id:run.id,authenticated:true,rows_found:rows.length,stock_rows_saved:saved,rows_matched:matched,rows_unmatched:Math.max(0,rows.length-matched),message:"Relevé UBIPHARM enregistré dans Provisit et disponible pour revue."});
 } catch(error) {
  if(run)try{await patchRun(env,run.id,{status:"failed",finished_at:new Date().toISOString(),error_code:error?.code||stage,error_message:String(error).slice(0,500),summary:"Échec de synchronisation à l'étape "+stage+".",metadata:{stage,portal_authentication:"unknown"}})}catch(updateError){console.error("run_failure_update",String(updateError))}
  console.error(JSON.stringify({event:"ubipharm_manual_sync_failed",run_id:run?.id||null,stage,error:String(error).slice(0,350)}));
  return json({status:"failed",run_id:run?.id||null,stage,error:String(error).slice(0,350)},502);
 } finally {if(browser)try{await timed(browser.close(),LIMIT.close,"browser_close")}catch{}}
}
