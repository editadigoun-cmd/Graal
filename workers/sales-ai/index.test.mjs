import test from "node:test";
import assert from "node:assert/strict";
import worker, {
  MODEL,
  TOOLS,
  estimateNeurons,
  normalizeName,
  parseDate,
  validatePeriod,
  weekStartsInRange,
  weeksStartingInMonth,
  executeTool
} from "./index.mjs";

test("GLM model and tools remain read-only", () => {
  assert.equal(MODEL, "@cf/zai-org/glm-4.7-flash");
  assert.ok(TOOLS.length >= 5);
  const names = TOOLS.map(t => t.function.name);
  assert.ok(names.includes("sales_summary"));
  assert.ok(names.includes("data_freshness"));
  assert.ok(names.every(n => !/(insert|update|delete|write|import|sql)/i.test(n)));
});

test("dates validate ISO calendar dates", () => {
  assert.equal(parseDate("2026-11-22")?.toISOString().slice(0, 10), "2026-11-22");
  assert.equal(parseDate("2026-02-30"), null);
  assert.equal(parseDate("22-11-2026"), null);
  assert.throws(() => validatePeriod("2026-11-20", "2026-11-01"));
  assert.throws(() => validatePeriod("2025-01-01", "2026-11-22"));
});

test("week allocation matches the Pilotage dashboard calendar", () => {
  assert.deepEqual(weekStartsInRange("2026-11-01", "2026-11-30"), [
    "2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30"
  ]);
  assert.equal(weeksStartingInMonth("2026-11"), 5);
  assert.equal(weeksStartingInMonth("2026-10"), 4);
});

test("neuron estimate and name normalization", () => {
  assert.equal(estimateNeurons(1000, 100), 9.14);
  assert.equal(normalizeName("Équipe Odypharm 2"), "equipe odypharm 2");
});

test("unknown tools are refused", async () => {
  await assert.rejects(() => executeTool({}, {}, "arbitrary_sql", {}), /Outil non autorisé/);
});

test("health route responds without invoking the AI binding", async () => {
  const response = await worker.fetch(new Request("https://agent.test/health", {
    headers: { Origin: "http://localhost:5173" }
  }), { ALLOWED_ORIGINS: "http://localhost:5173" });
  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.ok, true);
  assert.equal(json.model, MODEL);
});

test("CORS blocks unlisted origins", async () => {
  const response = await worker.fetch(new Request("https://agent.test/health", {
    headers: { Origin: "https://attacker.example" }
  }), { ALLOWED_ORIGINS: "http://localhost:5173" });
  assert.equal(response.status, 403);
});

test("chat rejects a request without Supabase authentication", async () => {
  const response = await worker.fetch(new Request("https://agent.test/api/chat", {
    method: "POST",
    headers: { Origin: "http://localhost:5173", "Content-Type": "application/json" },
    body: JSON.stringify({ conversation_id: "b8cd8cd3-2f0a-48d0-956e-5e78823fb8aa", message: "Analyse" })
  }), { ALLOWED_ORIGINS: "http://localhost:5173" });
  assert.equal(response.status, 401);
});

test("chat stores user and assistant messages, uses model, and finalizes quota", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const userId = "2aada0be-9c4c-4e00-b366-cc3b7bc4ff7f";
  const conversationId = "b8cd8cd3-2f0a-48d0-956e-5e78823fb8aa";
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method || "GET";
    calls.push({ path: url.pathname, method, body: init.body ? JSON.parse(init.body) : null });
    if (url.pathname.endsWith("/auth/v1/user")) return Response.json({ id: userId });
    if (url.pathname.endsWith("/rest/v1/profiles")) return Response.json([{ id: userId, role: "admin", actif: true }]);
    if (url.pathname.endsWith("/rest/v1/rpc/reserve_sales_ai_request")) return Response.json({ allowed: true, reservation_id: "00000000-0000-0000-0000-000000000001" });
    if (url.pathname.endsWith("/rest/v1/rpc/finalize_sales_ai_request")) return Response.json({ finalized: true });
    if (url.pathname.endsWith("/rest/v1/sales_ai_conversations") && method === "GET") {
      return Response.json([{ id: conversationId, owner_id: userId, title: "Nouvelle conversation" }]);
    }
    if (url.pathname.endsWith("/rest/v1/sales_ai_conversations") && method === "PATCH") return new Response(null, { status: 204 });
    if (url.pathname.endsWith("/rest/v1/sales_ai_messages") && method === "GET") return Response.json([]);
    if (url.pathname.endsWith("/rest/v1/sales_ai_messages") && method === "POST") return Response.json([{ id: "message-id" }]);
    throw new Error("Unexpected mocked fetch: " + url.pathname + " " + method);
  };
  try {
    const env = {
      SUPABASE_URL: "https://supabase.test",
      ALLOWED_ORIGINS: "http://localhost:5173",
      AI: {
        run: async (model, input) => {
          assert.equal(model, MODEL);
          assert.equal(input.chat_template_kwargs.enable_thinking, false);
          return {
            choices: [{ message: { content: "Les données sont prêtes pour l'analyse." } }],
            usage: { prompt_tokens: 20, completion_tokens: 8, neurons: 0.42 }
          };
        }
      }
    };
    const request = new Request("https://agent.test/api/chat", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        Authorization: "Bearer test-user-token",
        apikey: "test-publishable-key",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ conversation_id: conversationId, message: "Bonjour, que peux-tu analyser ?" })
    });
    const response = await worker.fetch(request, env);
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.match(text, /event: token/);
    assert.match(text, /Les données sont prêtes pour l'analyse/);
    assert.match(text, /event: done/);
    assert.equal(calls.filter(c => c.path.endsWith("/sales_ai_messages") && c.method === "POST").length, 2);
    assert.ok(calls.some(c => c.path.endsWith("/rpc/finalize_sales_ai_request")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
test("product matching endpoint requires admin auth", async () => {
  const response = await worker.fetch(new Request("https://agent.test/api/match-products", {
    method: "POST",
    headers: { Origin: "http://localhost:5173", "Content-Type": "application/json" },
    body: JSON.stringify({ catalog: [], rows: [] })
  }), { ALLOWED_ORIGINS: "http://localhost:5173" });
  assert.equal(response.status, 401);
});

test("product matching endpoint only returns catalogue product IDs", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/auth/v1/user")) return Response.json({ id: "admin-user" });
    if (url.pathname.endsWith("/rest/v1/profiles")) return Response.json([{ id: "admin-user", role: "admin", actif: true }]);
    throw new Error("Unexpected auth fetch: " + url.pathname);
  };
  try {
    const catalog = [{ id: "product-1", name: "Astymin Liquid 200ml" }];
    const response = await worker.fetch(new Request("https://agent.test/api/match-products", {
      method: "POST",
      headers: { Origin: "http://localhost:5173", Authorization: "Bearer user-token", apikey: "public-key", "Content-Type": "application/json" },
      body: JSON.stringify({ catalog, rows: [{ row_id: "1", source: "ASTYMIN LIQ 200", candidates: catalog }] })
    }), {
      ALLOWED_ORIGINS: "http://localhost:5173",
      SUPABASE_URL: "https://supabase.test",
      AI: {
        run: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                matches: [{
                  row_id: "1",
                  candidates: [
                    { product_id: "product-1", score: 0.91, reason: "Marque et format concordants" },
                    { product_id: "invented", score: 0.99 }
                  ]
                }]
              })
            }
          }]
        })
      }
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.matches[0].candidates.length, 1);
    assert.equal(data.matches[0].candidates[0].product_id, "product-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

