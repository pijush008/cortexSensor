export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex h-48 flex-col items-center justify-center gap-4">
      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-shm-navy-500"
            style={{ animation: `fade-in 0.6s ${i * 0.12}s ease-out infinite alternate` }}
          />
        ))}
      </div>
      <p className="font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-slate-400">{label}</p>
    </div>
  );
}