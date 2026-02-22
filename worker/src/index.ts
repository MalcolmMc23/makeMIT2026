export interface Env {
  DB: D1Database;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers so mobile app can call this
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    // POST /send-hello — receive a message from the phone, store it
    if (request.method === "POST" && url.pathname === "/send-hello") {
      let body: { message?: string } = {};
      try {
        body = await request.json();
      } catch {
        return new Response(JSON.stringify({ error: "Invalid JSON" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...cors },
        });
      }

      const message = body.message ?? "hello";

      await env.DB.prepare(
        "INSERT INTO hellos (message, created_at) VALUES (?, ?)"
      )
        .bind(message, new Date().toISOString())
        .run();

      return new Response(JSON.stringify({ ok: true, message }), {
        status: 201,
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    // GET /hellos — read all stored hellos
    if (request.method === "GET" && url.pathname === "/hellos") {
      const { results } = await env.DB.prepare(
        "SELECT id, message, created_at FROM hellos ORDER BY created_at DESC LIMIT 100"
      ).all();

      return new Response(JSON.stringify({ hellos: results }), {
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...cors },
    });
  },
};
