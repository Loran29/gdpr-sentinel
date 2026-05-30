"use client";

import { useMemo, useState } from "react";
import { Play, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Select, SelectItem } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/status-badge";
import { source_options } from "@/lib/mock-data";
import { use_app_state } from "@/context/app-state";
import { Scan } from "@/types/models";

export function RunScanPage() {
  const { append_scan } = use_app_state();
  const [source_id, set_source_id] = useState(source_options[0].id);
  const [scan_type, set_scan_type] = useState<"full" | "delta">("full");
  const [is_running, set_is_running] = useState(false);
  const [progress_pct, set_progress_pct] = useState(0);
  const [progress_ticks, set_progress_ticks] = useState(0);
  const [completed_scan, set_completed_scan] = useState<Scan | null>(null);

  const source = useMemo(
    () => source_options.find((item) => item.id === source_id) ?? source_options[0],
    [source_id]
  );

  const target = scan_type === "full"
    ? {
        duration_sec: 23.4,
        files_processed: 15,
        files_skipped: 0,
        files_with_findings: 12,
        total_findings: 47,
        result_hash: "b91e4c..."
      }
    : {
        duration_sec: 6.2,
        files_processed: 3,
        files_skipped: 12,
        files_with_findings: 3,
        total_findings: 9,
        result_hash: "15ac6b..."
      };

  const start_mock_scan = () => {
    set_is_running(true);
    set_progress_pct(0);
    set_progress_ticks(0);
    set_completed_scan(null);

    const total_ticks = 14;
    const interval = 220;
    const started_at = new Date().toISOString();

    const timer = setInterval(() => {
      set_progress_ticks((current_ticks) => {
        const next_ticks = current_ticks + 1;
        const next_progress = Math.min(100, Math.round((next_ticks / total_ticks) * 100));
        set_progress_pct(next_progress);

        if (next_ticks >= total_ticks) {
          clearInterval(timer);

          const completed_at = new Date().toISOString();
          const scan: Scan = {
            id: "scan_2026053014",
            source_id: source.id,
            scan_type,
            started_at,
            completed_at,
            duration_sec: target.duration_sec,
            files_processed: target.files_processed,
            files_skipped: target.files_skipped,
            files_with_findings: target.files_with_findings,
            total_findings: target.total_findings,
            result_hash: target.result_hash,
            status: "completed"
          };

          // TODO backend integration: POST /scan/run and POST /scan/delta
          set_completed_scan(scan);
          append_scan(scan);
          set_is_running(false);
        }

        return next_ticks;
      });
    }, interval);
  };

  const progress_files_processed = Math.round((target.files_processed * progress_pct) / 100);
  const progress_files_skipped = Math.round((target.files_skipped * progress_pct) / 100);
  const progress_files_with_findings = Math.max(0, Math.round((target.files_with_findings * progress_pct) / 100));
  const progress_duration = Number((target.duration_sec * (progress_pct / 100)).toFixed(1));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-text_dark">Run scan</h1>
        <p className="mt-1 text-sm text-text_medium">Start a full or delta scan and monitor execution metrics.</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.75fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Scan configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text_medium">Source</p>
              <Select value={source_id} onChange={(event) => set_source_id(event.target.value)}>
                {source_options.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label} ({option.path})
                  </SelectItem>
                ))}
              </Select>
              <p className="mt-1 font-mono text-xs text-text_medium">{source.path}</p>
            </div>

            <Tabs>
              <TabsList>
                <TabsTrigger active={scan_type === "full"} onClick={() => set_scan_type("full")}>
                  Full scan
                </TabsTrigger>
                <TabsTrigger active={scan_type === "delta"} onClick={() => set_scan_type("delta")}>
                  Delta scan
                </TabsTrigger>
              </TabsList>
              <TabsContent className="mt-3 grid gap-3 md:grid-cols-2">
                <Card className="border border-bosch_blue/25 bg-bosch_blue/5 p-3 shadow-none">
                  <p className="text-sm font-semibold text-text_dark">Full scan</p>
                  <p className="mt-1 text-sm text-text_medium">Processes all files in the selected source.</p>
                </Card>
                <Card className="border border-process_cyan/25 bg-process_cyan/5 p-3 shadow-none">
                  <p className="text-sm font-semibold text-text_dark">Delta scan</p>
                  <p className="mt-1 text-sm text-text_medium">
                    Processes only new or changed files using SHA256 file hashes.
                  </p>
                </Card>
              </TabsContent>
            </Tabs>

            <Button onClick={start_mock_scan} disabled={is_running} className="gap-2">
              {is_running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Start
              mock scan
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reproducibility note</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-text_dark">
              Same input plus same ruleset yields the same result hash. Delta scans skip unchanged files by
              SHA256.
            </p>
          </CardContent>
        </Card>
      </div>

      {(is_running || completed_scan) && (
        <Card>
          <CardHeader>
            <CardTitle>Mock scan progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-text_medium">Progress</p>
              <p className="font-mono text-xs text-text_dark">{progress_pct}%</p>
            </div>
            <Progress value={progress_pct} />
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
              <Metric label="Current source path" value={source.path} monospace />
              <Metric label="Scan type" value={scan_type} monospace />
              <Metric label="Files processed" value={String(progress_files_processed)} />
              <Metric label="Files skipped" value={String(progress_files_skipped)} />
              <Metric label="Files with findings" value={String(progress_files_with_findings)} />
              <Metric label="Duration" value={`${progress_duration}s`} />
              <Metric
                label="Scan speed"
                value={`${target.files_processed > 0 ? Math.max(1, Math.round(progress_files_processed / Math.max(progress_duration, 0.5))) : 0} files/sec`}
              />
              <Metric label="Result hash" value={progress_pct === 100 ? target.result_hash : "..."} monospace />
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border_grey/70 bg-slate-50 px-2.5 py-2">
              <p className="text-xs uppercase tracking-wide text-text_medium">Status</p>
              <StatusBadge value={is_running ? "running" : "completed"} />
            </div>
          </CardContent>
        </Card>
      )}

      {completed_scan && (
        <Card>
          <CardHeader>
            <CardTitle>Scan summary</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            <Metric label="scan_id" value={completed_scan.id} monospace />
            <Metric label="scan_type" value={completed_scan.scan_type} monospace />
            <Metric label="duration_sec" value={String(completed_scan.duration_sec)} />
            <Metric label="files_processed" value={String(completed_scan.files_processed)} />
            <Metric label="files_skipped" value={String(completed_scan.files_skipped)} />
            <Metric label="files_with_findings" value={String(completed_scan.files_with_findings)} />
            <Metric label="total_findings" value={String(completed_scan.total_findings)} />
            <Metric label="result_hash" value={completed_scan.result_hash} monospace />
            <Metric label="Reproducibility status" value="Stable result hash for unchanged input" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Metric({ label, value, monospace }: { label: string; value: string; monospace?: boolean }) {
  return (
    <div className="rounded-lg border border-border_grey/70 bg-slate-50 px-2.5 py-2">
      <p className="text-[11px] uppercase tracking-wide text-text_medium">{label}</p>
      <p className={`${monospace ? "font-mono text-[13px]" : "text-sm"} mt-1 text-text_dark`}>{value}</p>
    </div>
  );
}
