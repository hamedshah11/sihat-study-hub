// A stand-in for the Anthropic Messages API, so the Ask Florence tests never
// call the real API. The local tutor-ask edge function reaches it through
// ANTHROPIC_BASE_URL (written to supabase/functions/.env by
// `npm run e2e:supabase`). It always gives the same answer.

import { createServer } from "node:http";

export const STUB_REPLY =
  "Clean your hands at the five moments: before touching a patient, before a clean or aseptic procedure, after a risk of body fluid exposure, after touching a patient and after touching the patient's surroundings.\n\nSource: Hand hygiene";

const port = Number(process.env.E2E_ANTHROPIC_STUB_PORT ?? 54399);

createServer((req, res) => {
  if (req.method === "POST" && req.url === "/v1/messages") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id: "msg_local_e2e",
          type: "message",
          role: "assistant",
          model: "claude-haiku-4-5",
          content: [{ type: "text", text: STUB_REPLY }],
          stop_reason: "end_turn",
          usage: { input_tokens: 0, output_tokens: 0 },
        }),
      );
    });
    return;
  }
  // Playwright checks this to know the stub is up.
  res.writeHead(req.url === "/health" ? 200 : 404, { "content-type": "text/plain" });
  res.end(req.url === "/health" ? "ok" : "not found");
}).listen(port, "0.0.0.0", () => {
  console.log(`Anthropic stub listening on ${port}`);
});
