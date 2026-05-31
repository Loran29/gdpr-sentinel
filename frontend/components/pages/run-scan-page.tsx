"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, ChevronDown, ChevronUp, Cloud, ExternalLink, Play, RefreshCw, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectItem } from "@/components/ui/select";
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
  const [is_running, set_is_running] = useState(false);
  const [progress_pct, set_progress_pct] = useState(0);
  const [current_file, set_current_file] = useState<string | null>(null);
  const [elapsed_sec, set_elapsed_sec] = useState(0);
  const [files_processed, set_files_processed] = useState(0);
  const [files_skipped, set_files_skipped] = useState(0);
  const [completed_scan, set_completed_scan] = useState<Scan | null>(null);
  const [error_message, set_error_message] = useState<string | null>(null);
  const [upload_open, set_upload_open] = useState(false);
  const poll_ref = useRef<ReturnType<typeof setInterval> | null>(null);

  const source = source_options.find((s) => s.id === source_id) ?? source_options[0];

  const stop_polling = useCallback(() => {
    if (poll_ref.current) { clearInterval(poll_ref.current); poll_ref.current = null; }
  }, []);

  const start_scan = useCallback(async (type: "full" | "delta") => {
    set_is_running(true);
    set_progress_pct(0);
    set_current_file(null);
    set_elapsed_sec(0);
    set_files_processed(0);
    set_files_skipped(0);
    set_completed_scan(null);
    set_error_message(null);

    const result = type === "full"
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
      if (!scan_result) return;
      const s = scan_result as any;
      if (s.status === "running") {
        const p = s.progress;
        if (p) {
          set_progress_pct(p.percent ?? 0);
          set_current_file(p.current_file ?? null);
          set_elapsed_sec(p.elapsed_sec ?? 0);
          set_files_processed(p.files_completed ?? 0);
        }
        return;
      }
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
  }, [source.path, append_scan, stop_polling]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-text_dark">Run scan</h1>
        <p className="mt-1 text-sm text-text_medium">Scan your data sources for personal data and GDPR findings.</p>
      </div>

      {/* ── Action row ── */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text_medium">Source</p>
              <Select value={source_id} onChange={(e) => set_source_id(e.target.value)}>
                {source_options.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id}>{opt.label} ({opt.path})</SelectItem>
                ))}
              </Select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => start_scan("delta")}
                disabled={is_running}
                title="Processes only new or changed files using SHA-256 hashes — fast"
                className="inline-flex items-center gap-2 rounded-lg border border-border_grey bg-white px-4 py-2 text-sm font-medium text-text_dark shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50 dark:bg-slate-800 dark:hover:bg-slate-700"
              >
                <Zap className="h-4 w-4 text-bosch_blue" />
                Delta scan
              </button>
              <button
                onClick={() => start_scan("full")}
                disabled={is_running}
                title="Processes all files in the selected source from scratch"
                className="inline-flex items-center gap-2 rounded-lg bg-bosch_red px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-bosch_red/90 disabled:opacity-50"
              >
                <Activity className="h-4 w-4" />
                Full scan
              </button>
            </div>
          </div>
          {error_message && (
            <p className="mt-2 text-sm text-bosch_red">{error_message}</p>
          )}
        </CardContent>
      </Card>

      {/* ── Live progress ── */}
      {(is_running || completed_scan) && (
        <Card className={is_running ? "border-bosch_blue/30 bg-bosch_blue/5" : ""}>
          <CardContent className="space-y-3 pt-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-text_dark">
                {is_running ? "Scan in progress…" : "Scan complete"}
              </p>
              <div className="flex items-center gap-3">
                <p className="font-mono text-xs text-text_medium">{elapsed_sec.toFixed(1)}s</p>
                <StatusBadge value={is_running ? "running" : "completed"} />
              </div>
            </div>
            <Progress value={progress_pct} />
            {current_file && (
              <p className="truncate font-mono text-xs text-text_medium">Processing: {current_file}</p>
            )}
            {completed_scan && (
              <div className="grid gap-2 pt-1 md:grid-cols-2 lg:grid-cols-4">
                <Metric label="Files processed" value={String(files_processed)} />
                <Metric label="Files skipped" value={String(files_skipped)} />
                <Metric label="Findings" value={String(completed_scan.total_findings)} />
                <Metric label="Duration" value={`${completed_scan.duration_sec.toFixed(1)}s`} />
                <Metric label="Scan ID" value={completed_scan.id} monospace />
                <Metric label="Result hash" value={completed_scan.result_hash} monospace />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Config row: Scheduler + Data sources ── */}
      <div className="grid gap-3 lg:grid-cols-2">
        <SchedulerCard />
        <DataSourcesCard />
      </div>

      {/* ── Upload & scan (collapsible) ── */}
      <Card>
        <button
          onClick={() => set_upload_open((o) => !o)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text_dark">Upload &amp; scan</span>
            <span className="text-xs text-text_medium">— drop a PDF or Word file for a one-off scan</span>
          </div>
          {upload_open
            ? <ChevronUp className="h-4 w-4 text-text_medium" />
            : <ChevronDown className="h-4 w-4 text-text_medium" />}
        </button>
        {upload_open && (
          <CardContent className="border-t border-border_grey/60 pt-3">
            <UploadScanCard embedded />
          </CardContent>
        )}
      </Card>
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

function DataSourcesCard() {
  const [status, set_status] = useState<{ connected: boolean; user_name: string | null; user_email: string | null; azure_configured: boolean } | null>(null);
  const [scanning, set_scanning] = useState(false);
  const [progress, set_progress] = useState(0);
  const [done, set_done] = useState(false);
  const poll_ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("onedrive") === "connected") window.history.replaceState({}, "", window.location.pathname);
    fetch(`${API_BASE}/auth/status`).then(r => r.json()).then(set_status).catch(() => {});
  }, []);

  const connect = () => { window.location.href = `${API_BASE}/auth/microsoft`; };
  const disconnect = async () => {
    await fetch(`${API_BASE}/auth/logout`, { method: "POST" });
    set_status(s => s ? { ...s, connected: false, user_name: null, user_email: null } : null);
    set_done(false);
  };
  const scan_onedrive = async () => {
    set_scanning(true); set_progress(0); set_done(false);
    const resp = await fetch(`${API_BASE}/auth/onedrive/scan`, { method: "POST" });
    const data = await resp.json();
    if (data.error) { set_scanning(false); return; }
    poll_ref.current = setInterval(async () => {
      const s = await get_scan(data.scan_id) as any;
      if (!s || s.status === "running") { if (s?.progress) set_progress(s.progress.percent ?? 0); return; }
      clearInterval(poll_ref.current!); set_progress(100); set_scanning(false); set_done(true);
    }, 1000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cloud className="h-4 w-4 text-bosch_blue" />
          Data sources
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Local folder — always active */}
        <div className="flex items-center justify-between rounded-lg border border-border_grey bg-emerald-50/40 px-3 py-2.5 dark:bg-emerald-500/5">
          <div>
            <p className="text-sm font-medium text-text_dark">Local folder</p>
            <p className="text-xs text-text_medium font-mono">./data</p>
          </div>
          <span className="flex items-center gap-1 text-xs font-semibold text-success_green">
            <span className="h-1.5 w-1.5 rounded-full bg-success_green" />
            Active
          </span>
        </div>

        {/* OneDrive */}
        <div className="rounded-lg border border-border_grey px-3 py-2.5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-text_dark">OneDrive</p>
              <p className="text-xs text-text_medium">
                {status?.connected ? status.user_email ?? "Connected" : "Microsoft account"}
              </p>
            </div>
            {!status ? null : status.connected ? (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-xs font-semibold text-success_green">
                  <span className="h-1.5 w-1.5 rounded-full bg-success_green" />
                  Connected
                </span>
                <button onClick={disconnect} className="text-xs text-text_medium underline hover:text-text_dark">
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={status.azure_configured ? connect : () => { window.location.href = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=00000000-0000-0000-0000-000000000000&response_type=code&scope=Files.Read%20User.Read&prompt=select_account"; }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0078D4] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#006cbd]"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Sign in
              </button>
            )}
          </div>
          {status?.connected && !done && (
            <div className="mt-2.5">
              {scanning ? (
                <div className="space-y-1.5">
                  <Progress value={progress} />
                  <p className="text-xs text-text_medium">{progress}% — scanning OneDrive…</p>
                </div>
              ) : (
                <button
                  onClick={scan_onedrive}
                  className="inline-flex items-center gap-1.5 rounded-md bg-bosch_red px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-bosch_red/90"
                >
                  <Play className="h-3.5 w-3.5" />
                  Scan OneDrive
                </button>
              )}
            </div>
          )}
          {done && <p className="mt-2 text-xs font-medium text-success_green">Scan complete — check your review queue.</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function SchedulerCard() {
  const [scheduler, set_scheduler] = useState<{ interval_minutes: number; running: boolean; next_run_at: string | null }>({ interval_minutes: 0, running: false, next_run_at: null });
  const [saving, set_saving] = useState(false);
  const [input, set_input] = useState("1");
  const [unit, set_unit] = useState<"days" | "weeks" | "months">("days");

  useEffect(() => {
    get_scheduler_config().then(s => {
      set_scheduler(s as any);
      if (s.interval_minutes > 0) {
        const mins = s.interval_minutes;
        if (mins % (30 * 24 * 60) === 0) { set_input(String(mins / (30 * 24 * 60))); set_unit("months"); }
        else if (mins % (7 * 24 * 60) === 0) { set_input(String(mins / (7 * 24 * 60))); set_unit("weeks"); }
        else { set_input(String(Math.round(mins / (24 * 60)))); set_unit("days"); }
      } else { set_input("0"); }
    }).catch(() => {});
  }, []);

  const unit_to_minutes = (val: number, u: "days" | "weeks" | "months") => {
    if (u === "weeks") return val * 7 * 24 * 60;
    if (u === "months") return val * 30 * 24 * 60;
    return val * 24 * 60;
  };

  const save = async () => {
    const n = parseFloat(input);
    if (isNaN(n) || n < 0) return;
    set_saving(true);
    const minutes = n === 0 ? 0 : unit_to_minutes(Math.round(n), unit);
    const result = await set_scheduler_config(minutes);
    if (result.ok) set_scheduler(result.data as any);
    set_saving(false);
  };

  const scheduler_label = scheduler.interval_minutes > 0
    ? (() => {
        const mins = scheduler.interval_minutes;
        if (mins % (30 * 24 * 60) === 0) return `Every ${mins / (30 * 24 * 60)} month${mins / (30 * 24 * 60) > 1 ? "s" : ""}`;
        if (mins % (7 * 24 * 60) === 0) return `Every ${mins / (7 * 24 * 60)} week${mins / (7 * 24 * 60) > 1 ? "s" : ""}`;
        const days = Math.round(mins / (24 * 60));
        return `Every ${days} day${days > 1 ? "s" : ""}`;
      })()
    : "Off";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-bosch_blue" />
            Auto delta scan
          </span>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${scheduler.running ? "bg-success_green/15 text-success_green" : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"}`}>
            {scheduler.running ? scheduler_label.toUpperCase() : "OFF"}
          </span>
        </CardTitle>
        <p className="text-xs text-text_medium">
          {scheduler.running
            ? scheduler.next_run_at
              ? `Next run in ~${Math.max(0, Math.round((new Date(scheduler.next_run_at).getTime() - Date.now()) / 86400000 * 10) / 10)} days`
              : "Running"
            : "Automatically run a delta scan on a recurring schedule"}
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-text_medium">Every</span>
          <input
            type="number" min={0} step={1} value={input}
            onChange={(e) => set_input(e.target.value)}
            className="w-16 rounded-md border border-border_grey bg-white px-2.5 py-1.5 text-sm text-text_dark focus:border-bosch_blue focus:outline-none dark:bg-slate-800"
          />
          <select
            value={unit}
            onChange={(e) => set_unit(e.target.value as "days" | "weeks" | "months")}
            className="rounded-md border border-border_grey bg-white px-2.5 py-1.5 text-sm text-text_dark focus:border-bosch_blue focus:outline-none dark:bg-slate-800"
          >
            <option value="days">Days</option>
            <option value="weeks">Weeks</option>
            <option value="months">Months</option>
          </select>
          <button
            onClick={save} disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-bosch_blue px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-bosch_blue/85 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Apply"}
          </button>
          {scheduler.running && (
            <button
              onClick={async () => { set_input("0"); const r = await set_scheduler_config(0); if (r.ok) set_scheduler(r.data as any); }}
              className="text-xs text-text_medium underline hover:text-text_dark"
            >
              Disable
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
