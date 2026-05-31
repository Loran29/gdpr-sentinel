"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { format_bytes, format_number, format_timestamp } from "@/lib/utils";
import { get_admin_dashboard, get_resource_health, get_scan, run_full_scan, run_delta_scan } from "@/src/lib/api-client";
import { DashboardStats } from "@/types/models";
import { use_app_state } from "@/context/app-state";

export function AdminDashboardPage() {
  const { append_scan } = use_app_state();
  const [stats, set_stats] = useState<DashboardStats>(dashboard_stats);
  const [ram_mb, set_ram_mb] = useState<number | null>(null);
  const [cpu_pct, set_cpu_pct] = useState<number | null>(null);
  const [scan_running, set_scan_running] = useState(false);
  const [scan_progress, set_scan_progress] = useState(0);
  const [scan_current_file, set_scan_current_file] = useState<string | null>(null);
  const [scan_elapsed, set_scan_elapsed] = useState(0);
  const poll_ref = useRef<ReturnType<typeof setInterval> | null>(null);

  const load_stats = useCallback(async () => {
    const [resolved_stats, health] = await Promise.all([
      get_admin_dashboard(),
      get_resource_health(),
    ]);
    set_stats(resolved_stats);
    set_ram_mb(health.memory_peak_mb);
    set_cpu_pct(health.cpu_load_pct);
  }, []);

  useEffect(() => {
    let cancelled = false;
    load_stats().catch(() => {});
    return () => { cancelled = true; };
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

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text_dark">Admin dashboard</h1>
          <p className="mt-0.5 text-sm text-text_medium">
            Last scan {stats.last_scan_at ? format_timestamp(stats.last_scan_at) : "not available"}.
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

      {/* Row 1 — scan KPIs */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={HardDrive} label="Total files scanned" value={format_number(stats.total_files_scanned)} subtitle="across 3 sources" />
        <KpiCard icon={Server} label="Total data volume" value={format_bytes(stats.total_size_bytes)} />
        <KpiCard icon={AlertTriangle} label="Files flagged" value={format_number(stats.files_with_findings)} value_class_name="text-bosch_red" />
        <KpiCard icon={FileSearch} label="Total findings" value={String(stats.total_findings)} />
      </div>

      {/* Row 2 — accuracy KPIs */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={Gauge} label="Scan speed" value={`${cached_speed} files/sec`} subtitle={last_duration ? `Last scan: ${last_duration.toFixed(1)}s` : undefined} />
        <KpiCard icon={Clock} label="Avg file scan" value={`${format_number(stats.avg_file_scan_ms)} ms`} subtitle="cold · cached ~2× faster" />
        <KpiCard icon={CheckCircle} label="Detection precision" value={`${stats.precision_pct}%`} subtitle={`F1: ${stats.f1_score} · Recall: ${stats.recall_pct}%`} value_class_name="text-success_green" />
        <KpiCard icon={Activity} label="Recall" value={`${stats.recall_pct}%`} subtitle="% of real PII caught" />
      </div>

      {/* Row 3 — resource intensity + retention */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={MemoryStick} label="Peak RAM usage" value={ram_mb !== null ? `${ram_mb} MB` : "—"} subtitle="during last scan" />
        <KpiCard icon={Cpu} label="CPU load" value={cpu_pct !== null ? `${cpu_pct}%` : "—"} subtitle="during last scan" value_class_name={cpu_pct !== null && cpu_pct > 80 ? "text-bosch_red" : undefined} />
        {has_retention_card && (
          <KpiCard
            icon={AlertTriangle}
            label="Files past retention"
            value={String(stats.files_past_retention ?? 0)}
            subtitle="GDPR Art. 5(1)(e) violations"
            value_class_name={(stats.files_past_retention ?? 0) > 0 ? "text-bosch_red" : "text-success_green"}
          />
        )}
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
              { name: "OneDrive (stub)", active: false },
              { name: "SharePoint (stub)", active: false },
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

      <div className="grid gap-3 xl:grid-cols-[1.55fr_1fr]">
        <Card>
          <CardHeader><CardTitle>Findings by document type</CardTitle></CardHeader>
          <CardContent><DocumentTypeBarChart data={document_type_data} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Sensitivity distribution</CardTitle></CardHeader>
          <CardContent><SensitivityChart data={sensitivity_data} /></CardContent>
        </Card>
      </div>

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

