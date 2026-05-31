"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Cpu,
  FileSearch,
  Gauge,
  HardDrive,
  MemoryStick,
  Server
} from "lucide-react";
import { DocumentTypeBarChart } from "@/components/charts/document-type-bar-chart";
import { SensitivityChart } from "@/components/charts/sensitivity-chart";
import { KpiCard } from "@/components/kpi-card";
import { RecentScansCard } from "@/components/recent-scans-card";
import { ReproducibilityCard } from "@/components/reproducibility-card";
import { ResourceIntensityCard } from "@/components/resource-intensity-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dashboard_stats, reproducibility_snapshot, resource_intensity } from "@/lib/mock-data";
import { format_bytes, format_number, format_timestamp } from "@/lib/utils";
import { get_admin_dashboard, get_resource_health } from "@/src/lib/api-client";
import { DashboardStats } from "@/types/models";

export function AdminDashboardPage() {
  const [stats, set_stats] = useState<DashboardStats>(dashboard_stats);
  const [ram_mb, set_ram_mb] = useState<number | null>(null);
  const [cpu_pct, set_cpu_pct] = useState<number | null>(null);

  useEffect(() => {
    let is_cancelled = false;

    const load = async () => {
      const [resolved_stats, health] = await Promise.all([
        get_admin_dashboard(),
        get_resource_health()
      ]);
      if (is_cancelled) return;
      set_stats(resolved_stats);
      set_ram_mb(health.memory_peak_mb);
      set_cpu_pct(health.cpu_load_pct);
    };

    load();
    return () => { is_cancelled = true; };
  }, []);

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

  const timing_breakdown = stats.last_scan_timing_breakdown ?? null;
  const has_timing_breakdown =
    timing_breakdown !== null &&
    [timing_breakdown.extract_ms, timing_breakdown.presidio_ms, timing_breakdown.llm_ms, timing_breakdown.db_ms]
      .some((v) => typeof v === "number");
  const has_retention_card = typeof stats.files_past_retention === "number";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-text_dark">Admin dashboard</h1>
        <p className="mt-0.5 text-sm text-text_medium">
          Last scan {stats.last_scan_at ? format_timestamp(stats.last_scan_at) : "not available"}.
        </p>
      </div>

      {/* Row 1 — scan KPIs */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={HardDrive} label="Total files scanned" value={format_number(stats.total_files_scanned)} subtitle="across 3 sources" />
        <KpiCard icon={Server} label="Total data volume" value={format_bytes(stats.total_size_bytes)} />
        <KpiCard icon={AlertTriangle} label="Files flagged" value={format_number(stats.files_with_findings)} value_class_name="text-bosch_red" />
        <KpiCard icon={FileSearch} label="Total findings" value={String(stats.total_findings)} />
      </div>

      {/* Row 2 — accuracy + resource KPIs */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={Gauge} label="Scan speed" value={`${stats.scan_speed_files_per_sec} files/sec`} />
        <KpiCard icon={Clock} label="Avg file scan" value={`${format_number(stats.avg_file_scan_ms)} ms`} />
        <KpiCard icon={CheckCircle} label="Detection precision" value={`${stats.precision_pct}%`} subtitle={`F1: ${stats.f1_score} · Recall: ${stats.recall_pct}%`} value_class_name="text-success_green" />
        <KpiCard icon={Activity} label="Recall" value={`${stats.recall_pct}%`} subtitle="% of real PII caught" />
      </div>

      {/* Row 3 — resource intensity */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={MemoryStick}
          label="Peak RAM usage"
          value={ram_mb !== null ? `${ram_mb} MB` : "—"}
          subtitle="during last scan"
        />
        <KpiCard
          icon={Cpu}
          label="CPU load"
          value={cpu_pct !== null ? `${cpu_pct}%` : "—"}
          subtitle="during last scan"
          value_class_name={cpu_pct !== null && cpu_pct > 80 ? "text-bosch_red" : undefined}
        />
        {has_retention_card ? (
          <KpiCard
            icon={AlertTriangle}
            label="Files past retention"
            value={String(stats.files_past_retention ?? 0)}
            subtitle="GDPR Art. 5(1)(e) violations"
            value_class_name={(stats.files_past_retention ?? 0) > 0 ? "text-bosch_red" : "text-success_green"}
          />
        ) : null}
      </div>

      {/* Timing breakdown */}
      {has_timing_breakdown ? (
        <Card className="p-3">
          <CardHeader className="mb-2 border-b-0 pb-0">
            <CardTitle>Timing breakdown</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm md:grid-cols-2 xl:grid-cols-4">
            <Metric label="extract_ms" value={`${format_number(timing_breakdown?.extract_ms ?? 0)} ms`} />
            <Metric label="presidio_ms" value={`${format_number(timing_breakdown?.presidio_ms ?? 0)} ms`} />
            <Metric label="llm_ms" value={`${format_number(timing_breakdown?.llm_ms ?? 0)} ms`} />
            <Metric label="db_ms" value={`${format_number(timing_breakdown?.db_ms ?? 0)} ms`} />
          </CardContent>
        </Card>
      ) : null}

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

function Metric({ label, value, monospace, value_class_name }: { label: string; value: string; monospace?: boolean; value_class_name?: string }) {
  return (
    <div className="rounded-lg border border-border_grey/60 px-2.5 py-2">
      <p className="text-[11px] uppercase tracking-wide text-text_medium">{label}</p>
      <p className={`${monospace ? "font-mono text-[13px]" : "text-base"} ${value_class_name ?? "text-text_dark"} mt-1 font-semibold leading-none`}>
        {value}
      </p>
    </div>
  );
}
