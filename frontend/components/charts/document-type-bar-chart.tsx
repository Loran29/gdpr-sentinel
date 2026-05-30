"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function DocumentTypeBarChart({
  data
}: {
  data: Array<{ name: string; value: number }>;
}) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 20, right: 20, left: 0, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis dataKey="name" stroke="#6B7280" tick={{ fontSize: 12 }} angle={-15} textAnchor="end" />
          <YAxis stroke="#6B7280" tick={{ fontSize: 12 }} />
          <Tooltip
            contentStyle={{ borderRadius: 8, border: "1px solid #CBD5E1", fontSize: 12 }}
            labelStyle={{ color: "#334155", fontWeight: 600 }}
          />
          <Bar dataKey="value" fill="#334155" radius={[4, 4, 0, 0]}>
            <LabelList dataKey="value" position="top" style={{ fill: "#2E3033", fontSize: 12 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
