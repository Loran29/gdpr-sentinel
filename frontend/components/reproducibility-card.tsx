import { CheckCircle, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReproducibilitySnapshot } from "@/types/models";

export function ReproducibilityCard({ data }: { data: ReproducibilitySnapshot }) {
  const is_match = data.matching_status === "Match";
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reproducibility</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className={`flex items-center gap-3 rounded-lg p-3 ${
          is_match
            ? "border border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10"
            : "border border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10"
        }`}>
          {is_match
            ? <CheckCircle className="h-6 w-6 shrink-0 text-emerald-600 dark:text-emerald-400" />
            : <XCircle className="h-6 w-6 shrink-0 text-bosch_red" />
          }
          <div>
            <p className={`font-semibold ${is_match ? "text-emerald-700 dark:text-emerald-300" : "text-bosch_red"}`}>
              {is_match ? "Reproducible" : "Hash mismatch"}
            </p>
            <p className="text-xs text-text_medium">{data.explanation}</p>
          </div>
        </div>
        <div className="space-y-1.5 rounded-lg border border-border_grey/60 p-2.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-wide text-text_medium">Last scan hash</p>
            <p className="font-mono text-[11px] text-text_dark">{data.last_full_scan_hash.slice(0, 12)}…</p>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-wide text-text_medium">Previous hash</p>
            <p className="font-mono text-[11px] text-text_dark">{data.previous_full_scan_hash.slice(0, 12)}…</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
