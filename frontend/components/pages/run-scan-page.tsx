"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Play, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Select, SelectItem } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/status-badge";
import { source_options } from "@/lib/mock-data";
import { use_app_state } from "@/context/app-state";
import { get_scan, run_delta_scan, run_full_scan } from "@/src/lib/api-client";
import { Scan } from "@/types/models";

export function RunScanPage() {
  const { append_scan } = use_app_state();
  const [source_id, set_source_id] = useState(source_options[0].id);
  const [scan_type, set_scan_type] = useState<"full" | "delta">("full");
  const [is_running, set_is_running] = useState(false);
  const [progress_pct, set_progress_pct] = useState(0);
  const [current_file, set_current_file] = useState<string | null>(null);
  const [elapsed_sec, set_elapsed_sec] = useState(0);
  const [files_processed, set_files_processed] = useState(0);
  const [files_skipped, set_files_skipped] = useState(0);
  const [completed_scan, set_completed_scan] = useState<Scan | null>(null);
  const [error_message, set_error_message] = useState<string | null>(null);
  const poll_ref = useRef<ReturnType<typeof setInterval> | null>(null);

  const source = useMemo(
    () => source_options.find((item) => item.id === source_id) ?? source_options[0],
    [source_id]
  );

  const stop_polling = useCallback(() => {
    if (poll_ref.current) {
      clearInterval(poll_ref.current);
      poll_ref.current = null;
    }
  }, []);

  const start_scan = useCallback(async () => {
    set_is_running(true);
    set_progress_pct(0);
    set_current_file(null);
    set_elapsed_sec(0);
    set_files_processed(0);
    set_files_skipped(0);
    set_completed_scan(null);
    set_error_message(null);

    const result = scan_type === "full"
      ? await run_full_scan(source.path)
      : await run_delta_scan(source.path);

    if (!result.ok) {
      set_error_message(result.error.message);
      set_is_running(false);
      return;
    }

    const { scan_id } = result.data;

    poll_ref.current = setInterval(async () => {
      const scan_result = await get_scan(scan_id);
      if (!scan_result) {
        return;
      }

      if ((scan_result as any).status === "running") {
        const progress = (scan_result as any).progress;
        if (progress) {
          set_progress_pct(progress.percent ?? 0);
          set_current_file(progress.current_file ?? null);
          set_elapsed_sec(progress.elapsed_sec ?? 0);
          set_files_processed(progress.files_completed ?? 0);
        }
        return;
      }

      // Completed or failed
      stop_polling();
      const scan = scan_result as unknown as Scan;
      set_progress_pct(100);
      set_current_file(null);
      set_completed_scan(scan);
      set_files_processed(scan.files_processed);
      set_files_skipped(scan.files_skipped);
      append_scan(scan);
      set_is_running(false);
    }, 500);
  }, [scan_type, source.path, append_scan, stop_polling]);

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

            <Button onClick={start_scan} disabled={is_running} className="gap-2">
              {is_running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {is_running ? "Scanning..." : `Start ${scan_type} scan`}
            </Button>

            {error_message && (
              <p className="text-sm text-bosch_red">{error_message}</p>
            )}
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
            <CardTitle>{is_running ? "Scan in progress" : "Scan progress"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-text_medium">Progress</p>
              <p className="font-mono text-xs text-text_dark">{progress_pct}%</p>
            </div>
            <Progress value={progress_pct} />
            {current_file && (
              <p className="font-mono text-xs text-text_medium truncate">Processing: {current_file}</p>
            )}
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
              <Metric label="Source path" value={source.path} monospace />
              <Metric label="Scan type" value={scan_type} monospace />
              <Metric label="Files processed" value={String(files_processed)} />
              <Metric label="Files skipped" value={String(files_skipped)} />
              <Metric label="Duration" value={`${elapsed_sec.toFixed(1)}s`} />
              <Metric
                label="Result hash"
                value={completed_scan ? completed_scan.result_hash : "—"}
                monospace
              />
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



    <div className="rounded-lg border border-border_grey/70 bg-slate-50 px-2.5 py-2">
      <p className="text-[11px] uppercase tracking-wide text-text_medium">{label}</p>
      <p className={`${monospace ? "font-mono text-[13px]" : "text-sm"} mt-1 text-text_dark`}>{value}</p>
    </div>
  );
}
