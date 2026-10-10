// A stand-in for the Anthropic Messages API, so Ask Florence can be tested
// without calling the real API or spending tokens. The local tutor-ask edge
// function reaches it through ANTHROPIC_BASE_URL (e2e/supabase/functions.env).
//
// It always gives the same short answer, citing the "Pulse" section of the
// seeded Vital signs notes, and keeps the requests it received so a test can
// check what the edge function sent.

import http from "node:http";

export const STUB_PORT = Number(process.env.E2E_ANTHROPIC_STUB_PORT ?? 54399);
export const STUB_API_KEY = "e2e-stub-key";
export const STUB_REPLY =
  "A normal adult resting pulse is 60 to 100 beats a minute. If it is irregular, count it for a full minute.\n\nSource: Pulse";

type Received = { model: string; system: string; question: string };

export function startStub(port = STUB_PORT) {
  const received: Received[] = [];
  const server = http.createServer((req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.method === "GET" && req.url === "/health") return send(200, { ok: true });
    if (req.method === "GET" && req.url === "/requests") return send(200, received);
    if (req.method === "DELETE" && req.url === "/requests") {
      received.length = 0;
      return send(200, { ok: true });
    }
    if (req.method !== "POST" || req.url !== "/v1/messages") {
      return send(404, { type: "error", error: { type: "not_found_error", message: "Not found" } });
    }
    if (req.headers["x-api-key"] !== STUB_API_KEY || !req.headers["anthropic-version"]) {
      return send(401, {
        type: "error",
        error: { type: "authentication_error", message: "invalid x-api-key" },
      });
    }
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      let body: {
        model?: string;
        system?: string;
        messages?: { role: string; content: string }[];
      };
      try {
        body = JSON.parse(raw);
      } catch {
        return send(400, { type: "error", error: { type: "invalid_request_error" } });
      }
      received.push({
        model: body.model ?? "",
        system: body.system ?? "",
        question: body.messages?.at(-1)?.content ?? "",
      });
      send(200, {
        id: `msg_e2e_${received.length}`,
        type: "message",
        role: "assistant",
        model: body.model,
        content: [{ type: "text", text: STUB_REPLY }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      });
    });
  });
  // All interfaces: the edge runtime container calls in via host.docker.internal.
  server.listen(port, "0.0.0.0", () => {
    console.log(`[e2e] Anthropic stub listening on :${port}`);
  });
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startStub();
}
