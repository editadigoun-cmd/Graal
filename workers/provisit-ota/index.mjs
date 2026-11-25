const APP_ID = "com.provisit.provisit";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, GET, OPTIONS",
      "access-control-allow-headers": "Content-Type"
    }
  });
}

function compareSemver(a, b) {
  const pa = String(a || "0.0.0").split(/[+-]/)[0].split(".").map(n => Number(n) || 0);
  const pb = String(b || "0.0.0").split(/[+-]/)[0].split(".").map(n => Number(n) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, GET, OPTIONS",
        "access-control-allow-headers": "Content-Type"
      }});
    }

    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true, service: "Provisit OTA", storage: "Cloudflare R2" });
    }

    if (url.pathname === "/updates" && request.method === "POST") {
      let app;
      try {
        app = await request.json();
      } catch {
        return json({ error: "invalid_json" }, 400);
      }

      if (app?.app_id !== APP_ID) return json({ error: "unknown_app" }, 403);
      if (app?.platform !== "android" && app?.platform !== "ios") {
        return json({ message: "Unsupported platform" });
      }

      const latestObject = await env.OTA_BUCKET.get("latest.json");
      if (!latestObject) return json({ message: "No update published yet" });

      const latest = await latestObject.json();
      const installed = app.version_name === "builtin"
        ? "0.0.0"
        : String(app.version_name || "0.0.0");

      if (compareSemver(latest.version, installed) <= 0) {
        return json({ message: "Already up to date" });
      }

      return json({
        version: latest.version,
        url: `${url.origin}/bundle/${encodeURIComponent(latest.file)}`,
        checksum: latest.checksum
      });
    }

    if (url.pathname.startsWith("/bundle/") && request.method === "GET") {
      const file = decodeURIComponent(url.pathname.slice("/bundle/".length));
      if (!/^[a-zA-Z0-9._-]+\.zip$/.test(file)) return json({ error: "invalid_bundle" }, 400);

      const object = await env.OTA_BUCKET.get(`bundles/${file}`);
      if (!object) return json({ error: "not_found" }, 404);

      return new Response(object.body, { headers: {
        "content-type": "application/zip",
        "content-length": String(object.size),
        "cache-control": "public, max-age=31536000, immutable",
        "access-control-allow-origin": "*"
      }});
    }

    return json({ error: "not_found" }, 404);
  }
};