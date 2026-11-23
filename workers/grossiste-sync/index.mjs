/**
 * Provisit Grossiste Sync Worker
 * Read-only portal checks and extraction. No sales import in this worker.
 */
const PROVIDERS = {
  laborex: { loginUrl: "https://www.laborex-benin.com/fr/login", usernameSecret: "LABOREX_USERNAME", passwordSecret: "LABOREX_PASSWORD" },
  ubphar: { loginUrl: "https://www.ubphar.com/login/", usernameSecret: "UBPHAR_USERNAME", passwordSecret: "UBPHAR_PASSWORD" },
  ubipharm: { loginUrl: "https://client-benin.ubipharm.com/", usernameSecret: "UBIPHARM_USERNAME", passwordSecret: "UBIPHARM_PASSWORD" }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

function safeProviderName(name) {
  return Object.hasOwn(PROVIDERS, name) ? name : null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ service: "provisit-grossiste-sync", status: "ok", mode: "read-only", providers: Object.keys(PROVIDERS) });
    }
    if (request.method !== "POST" || !url.pathname.startsWith("/test/")) return json({ error: "Not found" }, 404);
    if (!env.SYNC_TOKEN || request.headers.get("authorization") !== `Bearer ${env.SYNC_TOKEN}`) {
      return json({ error: "Unauthorized" }, 401);
    }

    const provider = safeProviderName(url.pathname.slice("/test/".length));
    if (!provider) return json({ error: "Unknown provider" }, 400);
    const config = PROVIDERS[provider];
    if (!env[config.usernameSecret] || !env[config.passwordSecret]) {
      return json({ provider, status: "needs_configuration", missing: [config.usernameSecret, config.passwordSecret].filter(k => !env[k]) }, 409);
    }
    if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) {
      return json({ provider, status: "needs_configuration", missing: ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"] }, 409);
    }

    // Browser Run Script API integration intentionally requires a reviewed provider script.
    // Until selectors and post-login report navigation are validated, do not submit credentials.
    return json({
      provider,
      status: "adapter_not_yet_verified",
      loginUrl: config.loginUrl,
      message: "Credentials are configured. Provider-specific browser script must be reviewed and validated before login execution."
    }, 501);
  }
};

export { PROVIDERS, safeProviderName };
