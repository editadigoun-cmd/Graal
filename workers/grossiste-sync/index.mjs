/**
 * Provisit Grossiste Sync Worker.
 * Phase: browser diagnostics for UBIPHARM only. No sales import or portal mutation.
 */
const PROVIDERS = {
  laborex: { loginUrl: "https://www.laborex-benin.com/fr/login", usernameSecret: "LABOREX_USERNAME", passwordSecret: "LABOREX_PASSWORD" },
  ubphar: { loginUrl: "https://www.ubphar.com/login/", usernameSecret: "UBPHAR_USERNAME", passwordSecret: "UBPHAR_PASSWORD" },
  ubipharm: { loginUrl: "https://benin.ubipharm.com/fr", usernameSecret: "UBIPHARM_USERNAME", passwordSecret: "UBIPHARM_PASSWORD" }
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function safeProviderName(name) { return Object.hasOwn(PROVIDERS, name) ? name : null; }
function authorized(request, env) {
  return Boolean(env.SYNC_TOKEN && request.headers.get("authorization") === `Bearer ${env.SYNC_TOKEN}`);
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ service: "provisit-grossiste-sync", status: "ok", mode: "read-only-diagnostics", providers: Object.keys(PROVIDERS) });
    }
    if (request.method !== "POST" || !url.pathname.startsWith("/inspect/")) return json({ error: "Not found" }, 404);
    if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
    const provider = safeProviderName(url.pathname.slice("/inspect/".length));
    if (!provider) return json({ error: "Unknown provider" }, 400);
    if (provider !== "ubipharm") return json({ error: "Only UBIPHARM is enabled in this phase" }, 403);
    if (!env.BROWSER?.script) return json({ provider, status: "browser_binding_missing" }, 503);
    try {
      const result = await env.BROWSER.script(`async ({ page }) => {
        page.setDefaultNavigationTimeout(45000);
        await page.goto(${JSON.stringify(PROVIDERS.ubipharm.loginUrl)}, { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForTimeout(2500);
        const data = await page.evaluate(() => {
          const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
          const inputs = Array.from(document.querySelectorAll("input")).filter(visible).map((el) => ({
            type: el.type || "text", name: el.name || "", id: el.id || "", placeholder: el.placeholder || "",
            autocomplete: el.autocomplete || "", ariaLabel: el.getAttribute("aria-label") || ""
          }));
          const forms = Array.from(document.querySelectorAll("form")).filter(visible).map((form) => ({
            action: form.action, method: form.method, inputNames: Array.from(form.querySelectorAll("input")).map((el) => el.name || el.id || el.type)
          }));
          const links = Array.from(document.querySelectorAll("a")).filter(visible).slice(0,40).map((a) => ({ text: (a.innerText || a.textContent || "").trim().slice(0,100), href: a.href }));
          return { title: document.title, headings: Array.from(document.querySelectorAll("h1,h2,h3")).filter(visible).map(el => (el.innerText || "").trim()).slice(0,20), inputs, forms, links, bodyText: (document.body?.innerText || "").slice(0,2500) };
        });
        return { url: page.url(), ...data };
      }`, { library: "playwright", timeout: 60000, keepAlive: 30000 });
      return json({ provider, status: "portal_inspected", diagnostics: result });
    } catch (error) {
      return json({ provider, status: "browser_error", error: String(error).slice(0,500) }, 502);
    }
  }
};
export { PROVIDERS, safeProviderName };
