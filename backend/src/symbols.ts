/**
 * The instrument catalogue this service knows about.
 *
 * `decimals` is the number of decimal places the integer `price` carries, i.e.
 * a tick of { price: "18734", decimals: 2 } means 187.34.
 *
 * Keep in sync with feed/src/symbols.js.
 */
export interface Instrument {
  symbol: string;
  name: string;
  decimals: number;
}

export const SYMBOLS: readonly Instrument[] = [
  { symbol: "AAPL", name: "Apple Inc.", decimals: 2 },
  { symbol: "MSFT", name: "Microsoft Corp.", decimals: 2 },
  { symbol: "BTCUSD", name: "Bitcoin / USD", decimals: 2 },
  { symbol: "XAU", name: "Gold (spot, troy oz)", decimals: 4 },
  { symbol: "ASTR-RE1", name: "Assetera Vienna Residential I", decimals: 18 },
];

export const bySymbol = new Map(SYMBOLS.map((s) => [s.symbol, s]));

export const channelFor = (symbol: string): string => `ticks:${symbol}`;
