import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResourceIntensity } from "@/types/models";

export function ResourceIntensityCard({ data }: { data: ResourceIntensity }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Resource intensity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex items-center justify-between rounded-lg border border-border_grey/70 bg-slate-50 px-2.5 py-2">
          <span className="text-xs uppercase tracking-wide text-text_medium">CPU load</span>
          <span className="font-semibold text-text_dark">{data.cpu_load_pct}%</span>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border_grey/70 bg-slate-50 px-2.5 py-2">
          <span className="text-xs uppercase tracking-wide text-text_medium">Memory peak</span>
          <span className="font-semibold text-text_dark">{data.memory_peak_mb} MB</span>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border_grey/70 bg-slate-50 px-2.5 py-2">
          <span className="text-xs uppercase tracking-wide text-text_medium">LLM calls skipped in delta scan</span>
          <span className="font-semibold text-text_dark">{data.llm_calls_skipped_in_delta_scan}</span>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border_grey/70 bg-slate-50 px-2.5 py-2">
          <span className="text-xs uppercase tracking-wide text-text_medium">Files skipped</span>
          <span className="font-semibold text-text_dark">{data.files_skipped}</span>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border_grey/70 bg-slate-50 px-2.5 py-2">
          <span className="text-xs uppercase tracking-wide text-text_medium">Text extraction avoided</span>
          <span className="font-semibold text-text_dark">{data.text_extraction_avoided} files</span>
        </div>
      </CardContent>
    </Card>
  );
}
