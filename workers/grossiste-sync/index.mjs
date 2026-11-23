import { launch } from "@cloudflare/playwright";

/**
 * Provisit Grossiste Sync Worker.
 * UBIPHARM-only diagnostics. Read-only, no sales import.
 */
const PROVIDERS = {
  ubipharm: { portalUrl: "https://benin.ubipharm.com/fr" }
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function authorized(request, env) {
  return Boolean(env.SYNC_TOKEN && request.headers.get("authorization") === `Bearer ${env.SYNC_TOKEN}`);
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ service: "provisit-grossiste-sync", status: "ok", mode: "read-only-diagnostics", provider: "ubipharm" });
    }
    if (request.method !== "POST" || url.pathname !== "/inspect/ubipharm") return json({ error: "Not found" }, 404);
    if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
    if (!env.BROWSER) return json({ status: "browser_binding_missing" }, 503);
    let browser;
    try {
      browser = await launch(env.BROWSER);
      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(45000);
      await page.goto(PROVIDERS.ubipharm.portalUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(1500);
      const diagnostics = await page.evaluate(() => {
        const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
        return {
          title: document.title,
          url: location.href,
          headings: Array.from(document.querySelectorAll("h1,h2,h3")).filter(visible).map(el => (el.innerText || "").trim()).slice(0,20),
          inputs: Array.from(document.querySelectorAll("input")).filter(visible).map(el => ({
            type: el.type || "text", name: el.name || "", id: el.id || "", placeholder: el.placeholder || "",
            autocomplete: el.autocomplete || "", ariaLabel: el.getAttribute("aria-label") || ""
          })),
          forms: Array.from(document.querySelectorAll("form")).filter(visible).map(form => ({
            action: form.action, method: form.method, inputNames: Array.from(form.querySelectorAll("input")).map(el => el.name || el.id || el.type)
          })),
          links: Array.from(document.querySelectorAll("a")).filter(visible).slice(0,40).map(a => ({text:(a.innerText||a.textContent||"").trim().slice(0,100), href:a.href})),
          bodyText: (document.body?.innerText || "").slice(0,2500)
        };
      });
      return json({ provider: "ubipharm", status: "portal_inspected", diagnostics });
    } catch (error) {
      return json({ provider: "ubipharm", status: "browser_error", error: String(error).slice(0,400) }, 502);
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }
};
