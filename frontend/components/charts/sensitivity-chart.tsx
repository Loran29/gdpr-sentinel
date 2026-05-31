"use client";

import { useEffect, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const COLORS: Record<string, string> = {
  high: "#E00420",
  medium: "#FFCF00",
  low: "#00884A"
};

export function SensitivityChart({ data }: { data: Array<{ name: string; value: number }> }) {
  const [is_dark, set_is_dark] = useState(false);

  useEffect(() => {
    const check = () => set_is_dark(document.documentElement.classList.contains("dark"));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const total = data.reduce((s, d) => s + d.value, 0);
  const tooltip_bg     = is_dark ? "#1e293b" : "#ffffff";
  const tooltip_border = is_dark ? "#334155" : "#CBD5E1";
  const tooltip_text   = is_dark ? "#e2e8f0" : "#334155";

  return (
    <div className="relative flex h-full w-full flex-col">
      {/* Chart fills all available space */}
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius="85%"
              innerRadius="38%"
              paddingAngle={2}
              label={false}
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={COLORS[entry.name.toLowerCase()] ?? "#94a3b8"} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ borderRadius: 8, border: `1px solid ${tooltip_border}`, fontSize: 12, background: tooltip_bg }}
              labelStyle={{ color: tooltip_text, fontWeight: 600 }}
              formatter={(value: number, name: string) => [
                `${value} files (${total > 0 ? Math.round((value / total) * 100) : 0}%)`,
                name
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend — bottom right corner */}
      <div className="absolute bottom-0 right-0 flex items-center gap-3 pb-1 pr-1">
        {data.map((entry) => (
          <span key={entry.name} className="flex items-center gap-1">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: COLORS[entry.name.toLowerCase()] ?? "#94a3b8" }}
            />
            <span className="text-[11px] text-text_medium">{entry.name}</span>
            <span className="text-[11px] font-semibold text-text_dark">{entry.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
