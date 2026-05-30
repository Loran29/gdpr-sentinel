"use client";

import { useEffect, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

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
  const label_color    = is_dark ? "#cbd5e1" : "#334155";

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={100}
            label={({ name, value }) => `${name}: ${value}`}
            labelLine={{ stroke: label_color }}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={color_map[entry.name.toLowerCase()] ?? "#94a3b8"} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ borderRadius: 8, border: `1px solid ${tooltip_border}`, fontSize: 12, background: tooltip_bg }}
            labelStyle={{ color: tooltip_text, fontWeight: 600 }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
