import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import Redis from "ioredis";

import { changePercent, TickWindow, type Tick } from "./prices.js";
import { SYMBOLS, bySymbol, channelFor } from "./symbols.js";

const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const BUFFER_SIZE = Number(process.env.SNAPSHOT_BUFFER_SIZE ?? 240);

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true, credentials: true });

  // ---------------------------------------------------------------------------
  // Backplane. One long-lived subscriber keeps the snapshot window warm; each
  // SSE connection opens its own subscriber for the symbols it asked for.
  // ---------------------------------------------------------------------------
  const window = new TickWindow(BUFFER_SIZE);
  const warmer = new Redis(REDIS_URL);

  await warmer.subscribe(...SYMBOLS.map((s) => channelFor(s.symbol)));
  warmer.on("message", (_channel, message) => {
    try {
      window.push(JSON.parse(message) as Tick);
    } catch {
      app.log.warn({ message }, "unparseable tick");
    }
  });

  app.addHook("onClose", async () => {
    await warmer.quit();
  });

  // ---------------------------------------------------------------------------
  // Routes
  // ---------------------------------------------------------------------------

  app.get("/health", async () => ({ ok: true }));

  app.get("/api/symbols", async () => SYMBOLS);

  /**
   * Snapshot of the most recent ticks for one instrument.
   * Clients read this first, then attach to /api/stream for the deltas.
   */
  app.get<{
    Params: { symbol: string };
    Querystring: { limit?: string };
  }>("/api/snapshot/:symbol", async (request, reply) => {
    const instrument = bySymbol.get(request.params.symbol);
    if (!instrument) {
      return reply.code(404).send({ error: "unknown symbol" });
    }

    const limit = Math.min(Number(request.query.limit ?? 60), BUFFER_SIZE);
    const ticks = window.recent(instrument.symbol, limit);

    return {
      symbol: instrument.symbol,
      name: instrument.name,
      decimals: instrument.decimals,
      changePercent: changePercent(ticks),
      ticks,
    };
  });

  /**
   * Server-Sent Events fan-out.
   * GET /api/stream?symbols=AAPL,MSFT
   */
  app.get<{ Querystring: { symbols?: string } }>(
    "/api/stream",
    async (request, reply) => {
      const requested = (request.query.symbols ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => bySymbol.has(s));

      const symbols = requested.length > 0 ? requested : SYMBOLS.map((s) => s.symbol);

      // We write the head by hand, which bypasses the reply pipeline — so the
      // CORS headers @fastify/cors would have added have to be set here too.
      const origin = request.headers.origin;

      const raw = reply.raw;
      raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        ...(origin
          ? {
              "Access-Control-Allow-Origin": origin,
              "Access-Control-Allow-Credentials": "true",
              Vary: "Origin",
            }
          : {}),
      });
      raw.flushHeaders();

      const subscriber = new Redis(REDIS_URL);
      await subscriber.subscribe(...symbols.map(channelFor));

      subscriber.on("message", (_channel, message) => {
        let seq: number | undefined;
        try {
          seq = (JSON.parse(message) as Tick).seq;
        } catch {
          return;
        }
        raw.write(`id: ${seq}\nevent: tick\ndata: ${message}\n\n`);
      });

      request.raw.on("close", () => {
        void subscriber.quit();
      });

      // Fastify must not try to serialise a reply we are writing to by hand.
      return reply;
    },
  );

  // TODO(mkr): I started a websocket endpoint here before we settled on SSE.
  // Leaving the dependency in package.json until someone confirms nothing needs it.
  //
  //   const wss = new WebSocketServer({ server: app.server, path: "/ws" });
  //   wss.on("connection", (socket) => { ... });

  return app;
}
