"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  FileSearch,
  Gauge,
  HardDrive,
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
import { format_bytes_to_gb, format_number, format_timestamp } from "@/lib/utils";
import { get_admin_dashboard } from "@/src/lib/api-client";
import { DashboardStats } from "@/types/models";

export function AdminDashboardPage() {
  const [stats, set_stats] = useState<DashboardStats>(dashboard_stats);

  useEffect(() => {
    let is_cancelled = false;

    const load_dashboard = async () => {
      const resolved_stats = await get_admin_dashboard();
      if (is_cancelled) {
        return;
      }

      set_stats(resolved_stats);
    };

    load_dashboard();

    return () => {
      is_cancelled = true;
    };
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
    [
      timing_breakdown.extract_ms,
      timing_breakdown.presidio_ms,
      timing_breakdown.llm_ms,
      timing_breakdown.db_ms
    ].some((value) => typeof value === "number");
  const has_retention_card = typeof stats.files_past_retention === "number";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-text_dark">Admin dashboard</h1>
        <p className="mt-0.5 text-sm text-text_medium">
          Last scan {stats.last_scan_at ? format_timestamp(stats.last_scan_at) : "not available"}.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={HardDrive}
          label="Total files scanned"
          value={format_number(stats.total_files_scanned)}
          subtitle="across 3 sources"
        />
        <KpiCard icon={Server} label="Total data volume" value={format_bytes_to_gb(stats.total_size_bytes)} />
        <KpiCard
          icon={AlertTriangle}
          label="Files flagged"
          value={format_number(stats.files_with_findings)}
          value_class_name="text-bosch_red"
        />
        <KpiCard icon={FileSearch} label="Total findings" value={String(stats.total_findings)} />
        <KpiCard icon={Gauge} label="Scan speed" value={`${stats.scan_speed_files_per_sec} files/sec`} />
        <KpiCard icon={Clock} label="Avg file scan" value={`${format_number(stats.avg_file_scan_ms)} ms`} />
        <KpiCard
          icon={CheckCircle}
          label="Detection precision"
          value={`${stats.precision_pct}%`}
          subtitle={`F1: ${stats.f1_score}`}
          value_class_name="text-success_green"
        />
        <KpiCard icon={Activity} label="Recall" value={`${stats.recall_pct}%`} />
      </div>

      {has_timing_breakdown || has_retention_card ? (
        <div className={`grid gap-3 ${has_timing_breakdown && has_retention_card ? "xl:grid-cols-2" : "xl:grid-cols-1"}`}>
          {has_timing_breakdown ? (
            <Card className="p-3">
              <CardHeader className="mb-2 border-b-0 pb-0">
                <CardTitle>Timing breakdown</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 md:grid-cols-2 xl:grid-cols-4 text-sm">
                <Metric label="extract_ms" value={`${format_number(timing_breakdown?.extract_ms ?? 0)} ms`} />
                <Metric label="presidio_ms" value={`${format_number(timing_breakdown?.presidio_ms ?? 0)} ms`} />
                <Metric label="llm_ms" value={`${format_number(timing_breakdown?.llm_ms ?? 0)} ms`} />
                <Metric label="db_ms" value={`${format_number(timing_breakdown?.db_ms ?? 0)} ms`} />
              </CardContent>
            </Card>
          ) : null}

          {has_retention_card ? (
            <Card className="p-3">
              <CardHeader className="mb-2 border-b-0 pb-0">
                <CardTitle>Retention</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <Metric
                  label="files_past_retention"
                  value={String(stats.files_past_retention ?? 0)}
                  value_class_name={(stats.files_past_retention ?? 0) > 0 ? "text-bosch_red" : undefined}
                />
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-[1.55fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Findings by document type</CardTitle>
          </CardHeader>
          <CardContent className="rounded-lg border border-border_grey/70 bg-slate-50 p-2">
            <DocumentTypeBarChart data={document_type_data} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sensitivity distribution</CardTitle>
          </CardHeader>
          <CardContent className="rounded-lg border border-border_grey/70 bg-slate-50 p-2">
            <SensitivityChart data={sensitivity_data} />
          </CardContent>
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

function Metric({
  label,
  value,
  monospace,
  value_class_name
}: {
  label: string;
  value: string;
  monospace?: boolean;
  value_class_name?: string;
}) {
  return (
    <div className="rounded-lg border border-border_grey/70 bg-slate-50 px-2.5 py-2">
      <p className="text-[11px] uppercase tracking-wide text-text_medium">{label}</p>
      <p
        className={`${monospace ? "font-mono text-[13px]" : "text-base"} ${value_class_name ?? "text-text_dark"} mt-1 font-semibold leading-none`}
      >
        {value}
      </p>
    </div>
  );
}
