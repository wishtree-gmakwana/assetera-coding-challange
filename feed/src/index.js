import Redis from "ioredis";

import { SYMBOLS, channelFor } from "./symbols.js";

const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const INTERVAL_MS = Number(process.env.FEED_INTERVAL_MS ?? 500);

const redis = new Redis(REDIS_URL);

/**
 * Random walk in *minor units*, so we never touch a float.
 * Step is ~0.05% of the current price, which keeps every instrument moving at a
 * comparable visual rate regardless of how many decimals it carries.
 */
function nextPrice(current) {
  const step = current / 2000n;
  const jitter = BigInt(Math.floor(Math.random() * Number(step * 2n + 1n)));
  const next = current - step + jitter;
  return next > 0n ? next : current;
}

const state = new Map(
  SYMBOLS.map((s) => [s.symbol, { price: BigInt(s.start), seq: 0 }]),
);

async function tick() {
  const ts = Date.now();

  for (const instrument of SYMBOLS) {
    const entry = state.get(instrument.symbol);
    entry.price = nextPrice(entry.price);
    entry.seq += 1;

    const payload = JSON.stringify({
      symbol: instrument.symbol,
      price: entry.price.toString(),
      decimals: instrument.decimals,
      ts,
      seq: entry.seq,
    });

    await redis.publish(channelFor(instrument.symbol), payload);
  }
}

redis.on("ready", () => {
  console.log(
    `[feed] publishing ${SYMBOLS.length} instruments every ${INTERVAL_MS}ms to ${REDIS_URL}`,
  );
});

redis.on("error", (err) => {
  console.error("[feed] redis error:", err.message);
});

setInterval(() => {
  tick().catch((err) => console.error("[feed] publish failed:", err.message));
}, INTERVAL_MS);

const shutdown = () => {
  console.log("[feed] shutting down");
  redis.quit().finally(() => process.exit(0));
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
