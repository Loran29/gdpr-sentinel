"use client";

import { useEffect, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Legend } from "recharts";

const color_map: Record<string, string> = {
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

  const tooltip_bg     = is_dark ? "#1e293b" : "#ffffff";
  const tooltip_border = is_dark ? "#334155" : "#CBD5E1";
  const tooltip_text   = is_dark ? "#e2e8f0" : "#334155";

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="w-full" style={{ height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="45%"
            outerRadius={75}
            innerRadius={30}
            paddingAngle={2}
            label={({ name, value }) => value > 0 ? `${name[0].toUpperCase() + name.slice(1)}: ${value}` : ""}
            labelLine={false}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={color_map[entry.name.toLowerCase()] ?? "#94a3b8"} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ borderRadius: 8, border: `1px solid ${tooltip_border}`, fontSize: 12, background: tooltip_bg }}
            labelStyle={{ color: tooltip_text, fontWeight: 600 }}
            formatter={(value: number, name: string) => [`${value} files (${total > 0 ? Math.round(value / total * 100) : 0}%)`, name]}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            formatter={(value) => <span style={{ color: is_dark ? "#cbd5e1" : "#334155", fontSize: 12 }}>{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
