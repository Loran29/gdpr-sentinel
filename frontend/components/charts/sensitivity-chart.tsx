"use client";

export function SensitivityChart({ data }: { data: Array<{ name: string; value: number }> }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div className="flex h-24 items-center justify-center text-sm text-text_medium">No findings yet</div>;

  const colors: Record<string, { bar: string; label: string; bg: string }> = {
    High:   { bar: "bg-[#E00420]", label: "text-red-700 dark:text-red-300",     bg: "bg-red-50 dark:bg-red-500/10" },
    Medium: { bar: "bg-[#FFCF00]", label: "text-amber-700 dark:text-amber-300", bg: "bg-amber-50 dark:bg-amber-500/10" },
    Low:    { bar: "bg-[#00884A]", label: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-50 dark:bg-emerald-500/10" },
  };

  return (
    <div className="space-y-3 py-2">
      {/* Stacked bar */}
      <div className="flex h-6 w-full overflow-hidden rounded-lg">
        {data.filter(d => d.value > 0).map(d => (
          <div
            key={d.name}
            className={`${colors[d.name]?.bar ?? "bg-slate-400"} h-full transition-all`}
            style={{ width: `${(d.value / total) * 100}%` }}
            title={`${d.name}: ${d.value}`}
          />
        ))}
      </div>
      {/* Legend rows */}
      <div className="space-y-2">
        {data.map(d => {
          const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
          const c = colors[d.name] ?? { bar: "bg-slate-400", label: "text-text_dark", bg: "bg-slate-50" };
          return (
            <div key={d.name} className={`flex items-center justify-between rounded-lg px-3 py-2 ${c.bg}`}>
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-sm ${c.bar}`} />
                <span className={`text-sm font-medium ${c.label}`}>{d.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-lg font-bold tabular-nums ${c.label}`}>{d.value}</span>
                <span className="text-xs text-text_medium w-8 text-right">{pct}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
