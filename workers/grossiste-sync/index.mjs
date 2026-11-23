/**
 * Provisit Grossiste Sync Worker.
 * UBIPHARM-only diagnostics; no sales import or data extraction.
 */
const PORTAL = "https://fournisseur-benin.ubipharm.com";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
function authorized(request, env) {
  return Boolean(env.SYNC_TOKEN && request.headers.get("authorization") === `Bearer ${env.SYNC_TOKEN}`);
}
async function diagnostics(page) {
  return page.evaluate(() => {
    const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const cleanUrl = (href) => {
      try {
        const u = new URL(href, location.href);
        if (u.origin !== location.origin) return null;
        return u.pathname;
      } catch { return null; }
    };
    const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4"))
      .filter(visible).map(el => (el.innerText || "").trim()).filter(Boolean).slice(0,30);
    const links = Array.from(document.querySelectorAll("a")).filter(visible).slice(0,80)
      .map(a => ({ text: (a.innerText || a.textContent || "").trim().slice(0,100), path: cleanUrl(a.href) }))
      .filter(a => a.text && a.path);
    const tables = Array.from(document.querySelectorAll("table")).filter(visible).map((table, i) => ({
      index: i + 1,
      headers: Array.from(table.querySelectorAll("thead th, thead td, tr:first-child th"))
        .map(el => (el.innerText || el.textContent || "").trim()).filter(Boolean).slice(0,30),
      rowCount: Math.max(0, table.querySelectorAll("tbody tr").length || table.querySelectorAll("tr").length - 1)
    })).slice(0,20);
    const inputs = Array.from(document.querySelectorAll("input,select,textarea")).filter(visible).map(el => ({
      type: el.type || el.tagName.toLowerCase(), name: el.name || "", id: el.id || "",
      placeholder: el.placeholder || "", label: el.labels?.[0]?.innerText?.trim() || ""
    })).slice(0,30);
    const forms = Array.from(document.querySelectorAll("form")).filter(visible).map(form => ({
      actionPath: cleanUrl(form.action), method: (form.method || "get").toUpperCase(),
      fields: Array.from(form.querySelectorAll("input,select,textarea")).map(el => el.name || el.id || el.type).filter(Boolean)
    })).slice(0,10);
    const text = (document.body?.innerText || "").toLowerCase();
    const loginVisible = Array.from(document.querySelectorAll('input[type="password"]')).some(visible);
    const verificationRequired = /captcha|code de vérification|verification code|otp|authentification à deux facteurs|two.factor/.test(text);
    return {
      title: document.title, url: location.href, headings, links, tables, inputs, forms,
      loginVisible, verificationRequired,
      pageTextSignals: ["vente","statistique","laboratoire","produit","commande","facture","export","rapport","historique","dashboard"]
        .filter(word => text.includes(word))
    };
  });
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ service: "provisit-grossiste-sync", status: "ok", mode: "read-only-diagnostics", provider: "ubipharm" });
    }
    const route = url.pathname;
    if (request.method !== "POST" || !["/inspect/ubipharm", "/inspect/ubipharm/authenticated"].includes(route)) {
      return json({ error: "Not found" }, 404);
    }
    if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
    if (route.endsWith("/authenticated") && (!env.UBIPHARM_USERNAME || !env.UBIPHARM_PASSWORD)) {
      return json({ status: "credentials_missing" }, 503);
    }
    if (!env.BROWSER) return json({ status: "browser_binding_missing" }, 503);
    let browser;
    try {
      const { launch } = await import("@cloudflare/playwright");
      browser = await launch(env.BROWSER);
      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(45000);
      await page.goto(PORTAL, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(1200);
      if (route.endsWith("/authenticated")) {
        const login = page.locator('input[name="Login"], input[placeholder="Login"]').first();
        const password = page.locator('input[name="Password"], input[type="password"]').first();
        if (!(await login.count()) || !(await password.count())) {
          return json({ provider: "ubipharm", status: "login_form_not_found", diagnostics: await diagnostics(page) });
        }
        await login.fill(env.UBIPHARM_USERNAME);
        await password.fill(env.UBIPHARM_PASSWORD);
        const submit = page.locator('form button[type="submit"], form input[type="submit"], button:has-text("Se connecter")').first();
        if (await submit.count()) await submit.click();
        else await page.locator("form").first().evaluate(form => form.requestSubmit());
        try { await page.waitForLoadState("domcontentloaded", { timeout: 12000 }); } catch {}
        await page.waitForTimeout(2500);
        const d = await diagnostics(page);
        const status = d.verificationRequired ? "verification_required" : d.loginVisible ? "login_failed_or_rejected" : "authenticated_page_inspected";
        return json({ provider: "ubipharm", status, diagnostics: d });
      }
      return json({ provider: "ubipharm", status: "portal_inspected", diagnostics: await diagnostics(page) });
    } catch (error) {
      return json({ provider: "ubipharm", status: "browser_error", error: String(error).slice(0,400) }, 502);
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }
};
