"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Cloud, ExternalLink, Play, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Select, SelectItem } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/status-badge";
import { source_options } from "@/lib/mock-data";
import { use_app_state } from "@/context/app-state";
import { get_scan, get_scheduler_config, run_delta_scan, run_full_scan, set_scheduler_config } from "@/src/lib/api-client";
import { Scan } from "@/types/models";
import { UploadScanCard } from "@/components/upload-scan-card";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(/\/+$/, "");

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

        <OneDriveCard />
      </div>

      <SchedulerCard />

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
            <div className="flex items-center gap-2 rounded-lg border border-border_grey/70 bg-page_bg px-2.5 py-2 dark:bg-slate-800/50">
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

      <UploadScanCard />
    </div>
  );
}

function Metric({ label, value, monospace }: { label: string; value: string; monospace?: boolean }) {
  return (
    <div className="rounded-lg border border-border_grey/70 bg-page_bg px-2.5 py-2 dark:bg-slate-800/50">
      <p className="text-[11px] uppercase tracking-wide text-text_medium">{label}</p>
      <p className={`${monospace ? "font-mono text-[13px]" : "text-sm"} mt-1 break-all text-text_dark`}>{value}</p>
    </div>
  );
}

function OneDriveCard() {  const [status, set_status] = useState<{ connected: boolean; user_name: string | null; user_email: string | null; azure_configured: boolean } | null>(null);
  const [scanning, set_scanning] = useState(false);
  const [progress, set_progress] = useState(0);
  const [done, set_done] = useState(false);
  const poll_ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("onedrive") === "connected") {
      window.history.replaceState({}, "", window.location.pathname);
    }
    fetch(`${API_BASE}/auth/status`).then(r => r.json()).then(set_status).catch(() => {});
  }, []);

  const connect = () => { window.location.href = `${API_BASE}/auth/microsoft`; };

  const disconnect = async () => {
    await fetch(`${API_BASE}/auth/logout`, { method: "POST" });
    set_status(s => s ? { ...s, connected: false, user_name: null, user_email: null } : null);
    set_done(false);
  };

  const start_scan = async () => {
    set_scanning(true); set_progress(0); set_done(false);
    const resp = await fetch(`${API_BASE}/auth/onedrive/scan`, { method: "POST" });
    const data = await resp.json();
    if (data.error) { set_scanning(false); return; }
    poll_ref.current = setInterval(async () => {
      const scan = await get_scan(data.scan_id) as any;
      if (!scan || scan.status === "running") {
        if (scan?.progress) set_progress(scan.progress.percent ?? 0);
        return;
      }
      clearInterval(poll_ref.current!);
      set_progress(100); set_scanning(false); set_done(true);
    }, 1000);
  };

  if (!status) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cloud className="h-4 w-4 text-bosch_blue" />
          OneDrive connector
        </CardTitle>
        <p className="text-xs text-text_medium">
          Connect your Microsoft account to scan files directly from OneDrive.
        </p>
      </CardHeader>
      <CardContent>
        {!status.azure_configured ? (
          <p className="text-sm text-text_medium">Azure credentials not configured in .env</p>
        ) : !status.connected ? (
          <button
            onClick={connect}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0078D4] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#006cbd]"
          >
            <ExternalLink className="h-4 w-4" />
            Sign in with Microsoft
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-border_grey bg-emerald-50/50 px-3 py-2.5 dark:bg-emerald-500/5">
              <div>
                <p className="text-sm font-medium text-text_dark">{status.user_name}</p>
                <p className="text-xs text-text_medium">{status.user_email}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Connected
                </span>
                <button onClick={disconnect} className="text-xs text-text_medium underline hover:text-text_dark">
                  Disconnect
                </button>
              </div>
            </div>
            {scanning && (
              <div className="space-y-1.5">
                <Progress value={progress} />
                <p className="text-xs text-text_medium">{progress}% — scanning OneDrive...</p>
              </div>
            )}
            {done && (
              <p className="text-sm font-medium text-emerald-600">
                Scan complete — check findings in your review queue.
              </p>
            )}
            {!scanning && !done && (
              <button
                onClick={start_scan}
                className="inline-flex items-center gap-2 rounded-lg bg-bosch_red px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-bosch_red/90"
              >
                <Play className="h-4 w-4" />
                Scan my OneDrive
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SchedulerCard() {
  const PRESETS = [
    { label: "Off", value: 0 },
    { label: "1 day", value: 1 },
    { label: "3 days", value: 3 },
    { label: "7 days", value: 7 },
    { label: "14 days", value: 14 },
    { label: "30 days", value: 30 },
  ];

  const [scheduler, set_scheduler] = useState<{ interval_minutes: number; running: boolean; next_run_at: string | null }>({ interval_minutes: 0, running: false, next_run_at: null });
  const [saving, set_saving] = useState(false);
  const [input, set_input] = useState("0");

  useEffect(() => {
    get_scheduler_config().then(s => {
      set_scheduler(s as any);
      set_input(String(s.interval_minutes > 0 ? Math.round((s.interval_minutes / 1440) * 10) / 10 : 0));
    }).catch(() => {});
  }, []);

  const save = async () => {
    const days = parseFloat(input);
    if (isNaN(days) || days < 0) return;
    set_saving(true);
    const result = await set_scheduler_config(Math.round(days * 24 * 60));
    if (result.ok) set_scheduler(result.data as any);
    set_saving(false);
  };

  const scheduler_days = scheduler.interval_minutes > 0
    ? Math.round((scheduler.interval_minutes / 1440) * 10) / 10 : 0;
  const input_days = parseFloat(input);

  return (
    <Card className="p-3.5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-bosch_blue/25 bg-bosch_blue/10">
            <RefreshCw className="h-4 w-4 text-bosch_blue" />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text_medium">Auto delta scan</p>
            <p className="text-xs text-text_medium">
              {scheduler.running
                ? scheduler.next_run_at
                  ? `Next run in ~${Math.max(0, Math.round((new Date(scheduler.next_run_at).getTime() - Date.now()) / 86400000 * 10) / 10)} days`
                  : "Running"
                : "Disabled — runs delta scan automatically on a schedule"}
            </p>
          </div>
        </div>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${scheduler.running ? "bg-success_green/15 text-success_green" : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"}`}>
          {scheduler.running ? `EVERY ${scheduler_days}d` : "OFF"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => set_input(String(opt.value))}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
              input_days === opt.value
                ? "border-bosch_blue bg-bosch_blue/10 text-bosch_blue"
                : "border-border_grey bg-white text-text_medium hover:border-text_medium hover:text-text_dark dark:bg-slate-800 dark:hover:bg-slate-700"
            }`}
          >
            {opt.label}
          </button>
        ))}
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            step={1}
            value={input}
            onChange={(e) => set_input(e.target.value)}
            className="w-16 rounded-md border border-border_grey bg-white px-2.5 py-1 text-xs text-text_dark focus:border-bosch_blue focus:outline-none dark:bg-slate-800"
            placeholder="0"
          />
          <span className="text-xs text-text_medium">days</span>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-md bg-bosch_blue px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-bosch_blue/85 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Apply"}
        </button>
      </div>
    </Card>
  );
}

