"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function DocumentTypeBarChart({ data }: { data: Array<{ name: string; value: number }> }) {
  const [is_dark, set_is_dark] = useState(false);

  useEffect(() => {
    const check = () => set_is_dark(document.documentElement.classList.contains("dark"));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const grid_color   = is_dark ? "#334155" : "#E5E7EB";
  const axis_color   = is_dark ? "#94a3b8" : "#6B7280";
  const bar_fill     = is_dark ? "#3b82f6" : "#005691";
  const label_color  = is_dark ? "#e2e8f0" : "#2E3033";
  const tooltip_bg   = is_dark ? "#1e293b" : "#ffffff";
  const tooltip_border = is_dark ? "#334155" : "#CBD5E1";
  const tooltip_text = is_dark ? "#e2e8f0" : "#334155";

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 20, right: 20, left: 0, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={grid_color} />
          <XAxis dataKey="name" stroke={axis_color} tick={{ fontSize: 12, fill: axis_color }} angle={-15} textAnchor="end" />
          <YAxis stroke={axis_color} tick={{ fontSize: 12, fill: axis_color }} />
          <Tooltip
            contentStyle={{ borderRadius: 8, border: `1px solid ${tooltip_border}`, fontSize: 12, background: tooltip_bg }}
            labelStyle={{ color: tooltip_text, fontWeight: 600 }}
          />
          <Bar dataKey="value" fill={bar_fill} radius={[4, 4, 0, 0]}>
            <LabelList dataKey="value" position="top" style={{ fill: label_color, fontSize: 12 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
