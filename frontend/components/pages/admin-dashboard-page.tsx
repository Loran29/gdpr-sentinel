"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Cpu,
  FileSearch,
  Gauge,
  HardDrive,
  Link2,
  MemoryStick,
  Server,
  Zap
} from "lucide-react";
import { DocumentTypeBarChart } from "@/components/charts/document-type-bar-chart";
import { SensitivityChart } from "@/components/charts/sensitivity-chart";
import { KpiCard } from "@/components/kpi-card";
import { RecentScansCard } from "@/components/recent-scans-card";
import { ReproducibilityCard } from "@/components/reproducibility-card";
import { ResourceIntensityCard } from "@/components/resource-intensity-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { dashboard_stats, reproducibility_snapshot, resource_intensity } from "@/lib/mock-data";
import { format_bytes, format_number, format_timestamp, format_timestamp_short } from "@/lib/utils";
import { get_admin_dashboard, get_admin_owners, get_resource_health, get_scan, run_full_scan, run_delta_scan } from "@/src/lib/api-client";
import { DashboardStats, OwnerSummary } from "@/types/models";
import { use_app_state } from "@/context/app-state";

export function AdminDashboardPage() {
  const { append_scan } = use_app_state();
  const router = useRouter();
  const [stats, set_stats] = useState<DashboardStats>(dashboard_stats);
  const [ram_mb, set_ram_mb] = useState<number | null>(null);
  const [cpu_pct, set_cpu_pct] = useState<number | null>(null);
  const [scan_running, set_scan_running] = useState(false);
  const [scan_progress, set_scan_progress] = useState(0);
  const [scan_current_file, set_scan_current_file] = useState<string | null>(null);
  const [scan_elapsed, set_scan_elapsed] = useState(0);
  const poll_ref = useRef<ReturnType<typeof setInterval> | null>(null);
  const [top_owners, set_top_owners] = useState<OwnerSummary[]>([]);

  const load_stats = useCallback(async () => {
    const [resolved_stats, health, owners] = await Promise.all([
      get_admin_dashboard(),
      get_resource_health(),
      get_admin_owners(),
    ]);
    set_stats(resolved_stats);
    set_ram_mb(health.memory_peak_mb);
    set_cpu_pct(health.cpu_load_pct);
    set_top_owners(
      [...owners].sort((a, b) => b.pending_reviews - a.pending_reviews).slice(0, 3)
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    load_stats().catch(() => {});
    // Auto-refresh every 30s so dashboard stays live during scans
    const interval = setInterval(() => {
      if (!cancelled) load_stats().catch(() => {});
    }, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [load_stats]);

  const stop_poll = useCallback(() => {
    if (poll_ref.current) { clearInterval(poll_ref.current); poll_ref.current = null; }
  }, []);

  const start_scan = useCallback(async (type: "full" | "delta") => {
    set_scan_running(true);
    set_scan_progress(0);
    set_scan_current_file(null);
    set_scan_elapsed(0);

    const result = type === "full"
      ? await run_full_scan("./data")
      : await run_delta_scan("./data");

    if (!result.ok) { set_scan_running(false); return; }

    const { scan_id } = result.data;
    poll_ref.current = setInterval(async () => {
      const scan_result = await get_scan(scan_id);
      if (!scan_result) return;
      const s = scan_result as any;
      if (s.status === "running") {
        const p = s.progress;
        if (p) {
          set_scan_progress(p.percent ?? 0);
          set_scan_current_file(p.current_file ?? null);
          set_scan_elapsed(p.elapsed_sec ?? 0);
        }
        return;
      }
      stop_poll();
      set_scan_progress(100);
      set_scan_current_file(null);
      set_scan_running(false);
      append_scan(scan_result as any);
      await load_stats();
    }, 500);
  }, [append_scan, load_stats, stop_poll]);

  useEffect(() => () => stop_poll(), [stop_poll]);

  const document_type_data = useMemo(
    () => [
      { name: "Expense report", value: stats.findings_by_document_type?.expense_report ?? 0 },
      { name: "IT access request", value: stats.findings_by_document_type?.it_access_request ?? 0 },
      { name: "Incident report", value: stats.findings_by_document_type?.incident_report ?? 0 },
      { name: "Supplier onboarding", value: stats.findings_by_document_type?.supplier_onboarding ?? 0 },
      { name: "Training evaluation", value: stats.findings_by_document_type?.training_evaluation ?? 0 },
      { name: "Unknown", value: stats.findings_by_document_type?.unknown ?? 0 }
    ],
    [stats.findings_by_document_type]
  );

  const sensitivity_data = useMemo(
    () => [
      { name: "High", value: stats.findings_by_sensitivity?.high ?? 0 },
      { name: "Medium", value: stats.findings_by_sensitivity?.medium ?? 0 },
      { name: "Low", value: stats.findings_by_sensitivity?.low ?? 0 }
    ],
    [stats.findings_by_sensitivity]
  );

  const has_retention_card = typeof stats.files_past_retention === "number";
  const last_duration = stats.last_scan_duration_sec;
  const cached_speed = stats.scan_speed_files_per_sec;

  // Stale scan warning — last scan > 24h ago
  const last_scan_age_h = stats.last_scan_at
    ? (Date.now() - new Date(stats.last_scan_at).getTime()) / 3600000
    : null;
  const is_stale = last_scan_age_h !== null && last_scan_age_h > 24;

  // Timing breakdown for mini-bar (8)
  const timing = stats.last_scan_timing_breakdown;
  const timing_total = timing
    ? (timing.extract_ms ?? 0) + (timing.presidio_ms ?? 0) + (timing.llm_ms ?? 0) + (timing.db_ms ?? 0)
    : 0;
  const timing_bars = timing && timing_total > 0 ? [
    { label: "Extract", ms: timing.extract_ms ?? 0, color: "bg-bosch_blue" },
    { label: "Presidio", ms: timing.presidio_ms ?? 0, color: "bg-[#7A1FA2]" },
    { label: "LLM", ms: timing.llm_ms ?? 0, color: "bg-[#E00420]" },
    { label: "DB", ms: timing.db_ms ?? 0, color: "bg-success_green" },
  ] : null;

  // Sparkline: only show if there's actual variation
  const sparkline_data = (stats.recent_scans ?? []).slice(0, 5).reverse().map(s => s.findings_count);
  const sparkline_max = Math.max(...sparkline_data, 1);
  const show_sparkline = sparkline_data.length > 1 && Math.min(...sparkline_data) !== sparkline_max;

  // Compliance status for action required card
  const all_clear = (stats.pending_reviews_total ?? 0) === 0
    && (stats.overdue_reviews_count ?? 0) === 0
    && (stats.cleanup_overdue_count ?? 0) === 0;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text_dark">Admin dashboard</h1>
          <p className={`mt-0.5 text-sm ${is_stale ? "text-amber-600 font-medium" : "text-text_medium"}`}>
            {stats.last_scan_at
              ? `${is_stale ? "⚠ " : ""}Last scan ${format_timestamp(stats.last_scan_at)}${is_stale ? " — consider running a new scan" : ""}`
              : "No scan yet"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => start_scan("delta")}
            disabled={scan_running}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border_grey bg-white px-3 py-1.5 text-xs font-medium text-text_dark shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50 dark:bg-slate-800 dark:hover:bg-slate-700"
          >
            <Zap className="h-3.5 w-3.5 text-bosch_blue" />
            Delta scan
          </button>
          <button
            onClick={() => start_scan("full")}
            disabled={scan_running}
            className="inline-flex items-center gap-1.5 rounded-lg bg-bosch_red px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-bosch_red/90 disabled:opacity-50"
          >
            <Activity className="h-3.5 w-3.5" />
            Full scan
          </button>
        </div>
      </div>

      {/* Live scan progress */}
      {scan_running && (
        <Card className="border-bosch_blue/30 bg-bosch_blue/5">
          <CardContent className="py-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-bosch_blue">Scan in progress...</p>
              <p className="font-mono text-xs text-text_medium">{scan_progress}% · {scan_elapsed.toFixed(1)}s</p>
            </div>
            <Progress value={scan_progress} />
            {scan_current_file && (
              <p className="truncate font-mono text-xs text-text_medium">Processing: {scan_current_file}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Row 1 — scan coverage */}
      <div>
        <p className="mb-2 text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">Scan coverage</p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard icon={HardDrive} label="Total files scanned" value={format_number(stats.total_files_scanned)} />
          <KpiCard icon={Server} label="Total data volume" value={format_bytes(stats.total_size_bytes)} />
          {/* Merged: files with PII findings + sparkline trend (4, 9) */}
          <Card className="flex h-full min-h-[122px] flex-col p-3.5">
            <div className="mb-2 flex items-start justify-between">
              <p className="text-[11px] uppercase tracking-wide text-text_medium">Files with PII findings</p>
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border_grey bg-slate-50 dark:bg-slate-700/50">
                <FileSearch className="h-4 w-4 text-text_medium" />
              </span>
            </div>
            <div className="mt-auto flex items-end justify-between gap-2">
              <div>
                <p className="text-[25px] font-semibold leading-none tabular-nums text-bosch_red">
                  {format_number(stats.files_with_findings)}
                </p>
                <p className="mt-1 text-xs text-text_medium">{stats.total_findings} entities detected</p>
              </div>
              {/* Sparkline — only when trend varies */}
              {show_sparkline && (
                <div className="flex items-end gap-0.5 pb-0.5" title="Findings trend (last 5 scans)">
                  {sparkline_data.map((v, i) => (
                    <div
                      key={i}
                      className="w-1.5 rounded-sm bg-slate-300 dark:bg-slate-600"
                      style={{ height: `${Math.max(4, (v / sparkline_max) * 28)}px` }}
                    />
                  ))}
                </div>
              )}
            </div>
          </Card>
          <KpiCard icon={Gauge} label="Scan speed" value={`${cached_speed} files/sec`} subtitle={last_duration ? `Cold: ${last_duration.toFixed(1)}s · Cached: ~2s` : undefined} />
        </div>
      </div>

      {/* Row 2 — accuracy */}
      <div>
        <p className="mb-2 text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">Scan accuracy</p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard icon={Clock} label="Avg file scan" value={`${format_number(stats.avg_file_scan_ms)} ms`} subtitle="cold · delta ~76× faster with cache" />
          <KpiCard icon={CheckCircle} label="Detection precision" value={`${stats.precision_pct}%`} subtitle={`F1: ${stats.f1_score} · balance of precision & recall`} value_class_name="text-success_green" />
          <KpiCard icon={Activity} label="Recall" value={`${stats.recall_pct}%`} subtitle="% of real PII caught — higher is safer" />
          {has_retention_card && (
            <KpiCard
              icon={AlertTriangle}
              label="Files past retention"
              value={String(stats.files_past_retention ?? 0)}
              subtitle="GDPR Art. 5(1)(e) violations"
              value_class_name={(stats.files_past_retention ?? 0) > 0 ? "text-bosch_red" : "text-success_green"}
            />
          )}
        </div>
      </div>

      {/* Row 3 — resource intensity */}
      <div>
        <p className="mb-2 text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">Resource intensity</p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard icon={MemoryStick} label="Peak RAM usage" value={ram_mb !== null ? `${ram_mb} MB` : "—"} subtitle="during last scan" />
          <KpiCard icon={Cpu} label="CPU load" value={cpu_pct !== null ? `${cpu_pct}%` : "—"} subtitle="during last scan" value_class_name={cpu_pct !== null && cpu_pct > 80 ? "text-bosch_red" : undefined} />
          {/* Connectors status */}
          <Card className="flex h-full min-h-[122px] flex-col p-3.5">
            <div className="mb-2 flex items-start justify-between">
              <p className="text-[11px] uppercase tracking-wide text-text_medium">Connectors</p>
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-bosch_blue/25 bg-bosch_blue/10">
                <Link2 className="h-4 w-4 text-bosch_blue" />
              </span>
            </div>
            <div className="mt-auto space-y-1">
              {[
                { name: "Local folder", active: true },
                { name: "OneDrive", active: false },
                { name: "SharePoint", active: false },
              ].map(({ name, active }) => (
                <div key={name} className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-success_green" : "bg-slate-300 dark:bg-slate-600"}`} />
                  <span className={`text-xs ${active ? "font-medium text-text_dark" : "text-text_medium"}`}>{name}</span>
                  {active && <span className="ml-auto text-[10px] font-semibold text-success_green">ACTIVE</span>}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Findings by document type</CardTitle>
            <p className="text-xs text-text_medium">{stats.total_files_scanned} files · last scan {stats.last_scan_at ? format_timestamp_short(stats.last_scan_at) : "—"}</p>
          </CardHeader>
          <CardContent><DocumentTypeBarChart data={document_type_data} /></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Sensitivity distribution</CardTitle>
            <p className="text-xs text-text_medium">{stats.files_with_findings} files with findings</p>
          </CardHeader>
          <CardContent><SensitivityChart data={sensitivity_data} /></CardContent>
        </Card>
      </div>

      {/* Timing breakdown — tooltip-only legend (7, 8) */}
      {timing_bars && (
        <Card className="p-3.5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-text_dark">Pipeline timing breakdown</p>
            <p className="text-xs text-text_medium">Last scan · {timing_total.toFixed(0)} ms total</p>
          </div>
          <div className="flex h-6 w-full overflow-hidden rounded-lg">
            {timing_bars.map(({ label, ms, color }) => (
              <div
                key={label}
                className={`${color} h-full`}
                style={{ width: `${(ms / timing_total) * 100}%` }}
                title={`${label}: ${ms.toFixed(0)}ms (${((ms / timing_total) * 100).toFixed(0)}%)`}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {timing_bars.map(({ label, ms, color }) => (
              <span key={label} className="flex items-center gap-1 text-xs text-text_medium">
                <span className={`inline-block h-2 w-2 rounded-sm ${color}`} />
                {label}: <span className="font-medium text-text_dark">{ms.toFixed(0)}ms</span>
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Action required — always visible */}
      <Card className={all_clear
        ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-500/30 dark:bg-emerald-500/5"
        : "border-amber-300 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/5"
      }>
        <CardHeader className="pb-2 pt-3">
          <CardTitle className={`flex items-center gap-2 text-sm ${all_clear ? "text-emerald-700 dark:text-emerald-300" : "text-amber-800 dark:text-amber-300"}`}>
            {all_clear ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {all_clear ? "All reviews up to date" : "Action required"}
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-3">
          <div className="grid gap-6 md:grid-cols-3">
            <div className="space-y-1">
              <p className={`text-[11px] font-semibold uppercase tracking-widest ${all_clear ? "text-emerald-600 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}>Pending reviews</p>
              <button
                onClick={() => router.push("/all-findings?status=pending")}
                className={`text-3xl font-bold tabular-nums transition-opacity hover:opacity-70 ${
                  (stats.pending_reviews_total ?? 0) > 0 ? "text-amber-800 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"
                }`}
              >
                {stats.pending_reviews_total ?? 0}
              </button>
              <p className={`text-xs ${(stats.pending_reviews_total ?? 0) === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-text_medium"}`}>
                {(stats.pending_reviews_total ?? 0) === 0 ? "✓ All reviewed" : "Click to view →"}
              </p>
            </div>
            <div className="space-y-1">
              <p className={`text-[11px] font-semibold uppercase tracking-widest ${all_clear ? "text-emerald-600 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}>Overdue &gt;30 days</p>
              <p className={`text-3xl font-bold tabular-nums ${(stats.overdue_reviews_count ?? 0) > 0 ? "text-bosch_red" : "text-emerald-700 dark:text-emerald-300"}`}>
                {stats.overdue_reviews_count ?? 0}
              </p>
              <p className={`text-xs ${(stats.overdue_reviews_count ?? 0) === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-bosch_red"}`}>
                {(stats.overdue_reviews_count ?? 0) === 0 ? "✓ No overdue" : "GDPR risk — requires attention"}
              </p>
            </div>
            <div className="space-y-1">
              <p className={`text-[11px] font-semibold uppercase tracking-widest ${all_clear ? "text-emerald-600 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}>Cleanup overdue</p>
              <p className={`text-3xl font-bold tabular-nums ${(stats.cleanup_overdue_count ?? 0) > 0 ? "text-bosch_red" : "text-emerald-700 dark:text-emerald-300"}`}>
                {stats.cleanup_overdue_count ?? 0}
              </p>
              <p className={`text-xs ${(stats.cleanup_overdue_count ?? 0) === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-bosch_red"}`}>
                {(stats.cleanup_overdue_count ?? 0) === 0 ? "✓ All clean" : "Deadline passed — escalated"}
              </p>
            </div>
          </div>

          {/* Top offenders */}
          {!all_clear && top_owners.filter(o => o.pending_reviews > 0).length > 0 && (
            <div className="mt-4 border-t border-amber-200/60 pt-3 dark:border-amber-500/20">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-400">Top pending by owner</p>
              <div className="grid gap-2 md:grid-cols-3">
                {top_owners.filter(o => o.pending_reviews > 0).map(o => (
                  <button
                    key={o.user_id}
                    onClick={() => router.push(`/all-findings?owner=${o.user_id}&status=pending`)}
                    className="flex items-center justify-between rounded-lg border border-amber-200 bg-white px-3 py-2 text-left transition-colors hover:bg-amber-50 dark:border-amber-500/20 dark:bg-slate-800/50 dark:hover:bg-amber-500/10"
                  >
                    <span className="text-sm font-medium text-text_dark">{o.name}</span>
                    <span className="ml-2 shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                      {o.pending_reviews}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 xl:grid-cols-[1.6fr_1fr]">
        <RecentScansCard recent_scans={stats.recent_scans ?? []} />
        <div className="space-y-3">
          <ReproducibilityCard data={reproducibility_snapshot} />
          <ResourceIntensityCard data={resource_intensity} />
        </div>
      </div>
    </div>
  );
}

