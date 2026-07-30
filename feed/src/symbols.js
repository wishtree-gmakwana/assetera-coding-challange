/**
 * The instrument catalogue the feed emits.
 *
 * `decimals` is the number of decimal places the integer `price` carries, i.e.
 * a tick of { price: "18734", decimals: 2 } means 187.34.
 *
 * Keep in sync with backend/src/symbols.ts.
 */
export const SYMBOLS = [
  { symbol: "AAPL", name: "Apple Inc.", decimals: 2, start: "18734" },
  { symbol: "MSFT", name: "Microsoft Corp.", decimals: 2, start: "41288" },
  { symbol: "BTCUSD", name: "Bitcoin / USD", decimals: 2, start: "6431900" },
  { symbol: "XAU", name: "Gold (spot, troy oz)", decimals: 4, start: "24178500" },
  {
    symbol: "ASTR-RE1",
    name: "Assetera Vienna Residential I",
    decimals: 18,
    start: "1234567890123456789",
  },
];

export const channelFor = (symbol) => `ticks:${symbol}`;
