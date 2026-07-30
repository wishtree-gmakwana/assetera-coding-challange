export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-neutral-500">
          Assetera
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Live Ticker</h1>
      </div>

      <p className="text-neutral-400">
        Nothing here yet — this is where your work goes. The backend is already
        running and streaming; see the README for the endpoints.
      </p>

      <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4 font-mono text-sm text-neutral-400">
        <p>GET http://localhost:4000/api/symbols</p>
        <p>GET http://localhost:4000/api/snapshot/AAPL?limit=60</p>
        <p>GET http://localhost:4000/api/stream?symbols=AAPL,MSFT</p>
      </div>
    </main>
  );
}
