"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2 } from "lucide-react";
import { Finding } from "@/types/models";
import { Button } from "@/components/ui/button";
import { EntityTable } from "@/components/entity-table";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { format_document_type, format_timestamp } from "@/lib/utils";

export function FindingDetailPanel({
  finding,
  preview_url,
  on_apply_action
}: {
  finding: Finding | null;
  preview_url?: string;
  on_apply_action: (
    finding_id: string,
    review_status: "keep_business_need" | "mark_false_positive" | "delete",
    review_note: string
  ) => void;
}) {
  const [review_note, set_review_note] = useState("");

  useEffect(() => {
    set_review_note(finding?.review_note ?? "");
  }, [finding?.id, finding?.review_note]);

  const note_is_valid = useMemo(() => review_note.trim().length > 0, [review_note]);

  if (!finding) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-text_medium">
        Select a finding to view details.
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* Metadata table */}
      <div className="rounded-lg border border-border_grey p-3">
        <table className="w-full text-sm">
          <tbody>
            {[
              { label: "File name",     value: finding.file_name,                        mono: false },
              { label: "File path",     value: finding.file_path,                        mono: true  },
              { label: "SHA-256",       value: `${finding.file_sha256.slice(0, 16)}...`, mono: true  },
              { label: "Document type", value: format_document_type(finding.document_type), mono: false },
              { label: "Owner",         value: finding.owner_name ?? "—",                mono: false },
              { label: "Master of Data",value: finding.master_of_data_id ?? "—",         mono: true  },
              { label: "Scanned",       value: format_timestamp(finding.scan_timestamp),  mono: true  },
            ].map(({ label, value, mono }) => (
              <tr key={label} className="border-b border-border_grey/40 last:border-0">
                <td className="w-36 shrink-0 py-1.5 pr-3 align-top text-[11px] font-semibold uppercase tracking-wide text-text_medium">
                  {label}
                </td>
                <td className={`min-w-0 break-all py-1.5 align-top ${mono ? "font-mono text-[12px]" : ""} text-text_dark`}>
                  {value}
                </td>
              </tr>
            ))}
            {[
              { label: "Sensitivity",   node: <StatusBadge value={finding.sensitivity_level} /> },
              { label: "Owner type",    node: <StatusBadge value={finding.owner_type} /> },
              { label: "Review status", node: <StatusBadge value={finding.review_status} /> },
            ].map(({ label, node }) => (
              <tr key={label} className="border-b border-border_grey/40 last:border-0">
                <td className="w-36 py-1.5 pr-3 align-middle text-[11px] font-semibold uppercase tracking-wide text-text_medium">
                  {label}
                </td>
                <td className="py-1.5 align-middle">{node}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Separator />

      <div className="rounded-lg border border-border_grey p-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text_medium">Reasoning</p>
        <GdprArticleBadges reasoning={finding.reasoning} />
        <p className="mt-2 text-sm text-text_dark">{finding.reasoning}</p>
      </div>

      <div className="rounded-lg border border-border_grey p-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text_medium">Retention recommendation</p>
        <p className="text-sm text-text_dark">{finding.retention_recommendation}</p>
        {finding.retention_recommendation && (
          <RetentionDeadlineBadge recommendation={finding.retention_recommendation} scan_timestamp={finding.scan_timestamp} />
        )}
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text_medium">Entities</p>
        <EntityTable entities={finding.entities} />
      </div>

      {preview_url && (
        <div className="rounded-lg border border-border_grey bg-slate-50 p-3 dark:bg-slate-800/50">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-text_medium">PDF preview</p>
            <a
              href={preview_url}
              target="_blank"
              rel="noopener noreferrer"
              title="Open full screen"
              className="flex h-6 w-6 items-center justify-center rounded border border-border_grey bg-white text-text_medium transition-colors hover:border-slate-400 hover:text-text_dark dark:bg-slate-700 dark:hover:bg-slate-600"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </a>
          </div>
          <embed src={preview_url} type="application/pdf" className="h-64 w-full rounded" />
        </div>
      )}

      <Separator />

      {finding.review_status === "pending" && (
        <div className="space-y-2 rounded-lg border border-border_grey p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-text_medium">Review note</p>
          <Textarea
            placeholder="Add context before applying review action"
            value={review_note}
            onChange={(event) => set_review_note(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={!note_is_valid}
              onClick={() => on_apply_action(finding.id, "keep_business_need", review_note.trim())}
            >
              Keep: business need
            </Button>
            <Button
              variant="outline"
              disabled={!note_is_valid}
              onClick={() => on_apply_action(finding.id, "mark_false_positive", review_note.trim())}
            >
              Acknowledge cleanup
            </Button>
            <Button
              variant="destructive"
              disabled={!note_is_valid}
              onClick={() => on_apply_action(finding.id, "delete", review_note.trim())}
            >
              Delete file
            </Button>
          </div>
        </div>
      )}

      {finding.review_status !== "pending" && finding.review_note && (
        <div className="rounded-lg border border-border_grey p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text_medium">Review note</p>
          <p className="text-sm text-text_dark">{finding.review_note}</p>
        </div>
      )}
    </div>
  );
}

function GdprArticleBadges({ reasoning }: { reasoning: string }) {
  const matches = Array.from(
    new Set(
      [...reasoning.matchAll(/(?:GDPR\s+)?Art(?:icle)?\.?\s*(\d+(?:\(\d+\))?(?:\([a-z]\))?)/gi)]
        .map((m) => `Art. ${m[1]}`)
    )
  );
  if (matches.length === 0) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-1">
      {matches.map((article) => (
        <span
          key={article}
          className="inline-flex items-center rounded-md border border-blue-300 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300"
        >
          GDPR {article}
        </span>
      ))}
    </div>
  );
}

function RetentionDeadlineBadge({ recommendation, scan_timestamp }: { recommendation: string; scan_timestamp: string }) {
  const year_match = recommendation.match(/\b(20\d{2})\b/);
  if (!year_match) return null;
  const deadline_year = parseInt(year_match[1]);
  const now_year = new Date().getFullYear();
  const is_overdue = deadline_year <= now_year;
  return (
    <div className={`mt-2 inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
      is_overdue
        ? "border-red-400 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300"
        : "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300"
    }`}>
      {is_overdue ? "⚠ Overdue — " : "Retain until "}
      {deadline_year}
    </div>
  );
}
