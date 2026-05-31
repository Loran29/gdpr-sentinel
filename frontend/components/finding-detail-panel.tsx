"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2 } from "lucide-react";
import { Finding } from "@/types/models";
import { Button } from "@/components/ui/button";
import { EntityTable } from "@/components/entity-table";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectItem } from "@/components/ui/select";
import { format_document_type, format_timestamp } from "@/lib/utils";

const LEGAL_BASIS_OPTIONS = [
  { value: "Art. 6(1)(b)", label: "Contractual necessity — Art. 6(1)(b)" },
  { value: "Art. 6(1)(c)", label: "Legal obligation — Art. 6(1)(c)" },
  { value: "Art. 6(1)(f)", label: "Legitimate interest — Art. 6(1)(f)" },
];

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
    review_note: string,
    options?: { legal_basis?: string; cleanup_deadline?: string }
  ) => void;
}) {
  const [legal_basis, set_legal_basis] = useState("");
  const [keep_note, set_keep_note] = useState("");
  const [cleanup_deadline, set_cleanup_deadline] = useState("");
  const [cleanup_note, set_cleanup_note] = useState("");
  const [delete_confirm, set_delete_confirm] = useState(false);

  useEffect(() => {
    set_legal_basis("");
    set_keep_note("");
    set_cleanup_deadline("");
    set_cleanup_note("");
    set_delete_confirm(false);
  }, [finding?.id]);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const min_date = tomorrow.toISOString().split("T")[0];

  const note_is_valid = true; // notes are optional in new flow

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
        <div className="space-y-3">

          {/* Keep: business need */}
          <div className="rounded-lg border border-border_grey p-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400">Keep: business need</p>
            <Select value={legal_basis} onChange={e => set_legal_basis(e.target.value)}>
              <SelectItem value="">Select legal basis (required)...</SelectItem>
              {LEGAL_BASIS_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </Select>
            <Textarea placeholder="Optional note" value={keep_note} onChange={e => set_keep_note(e.target.value)} />
            <Button
              variant="secondary"
              disabled={!legal_basis}
              className="w-full"
              onClick={() => on_apply_action(finding.id, "keep_business_need", keep_note.trim(), { legal_basis })}
            >
              Confirm retention basis
            </Button>
          </div>

          {/* Acknowledge cleanup */}
          <div className="rounded-lg border border-border_grey p-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Acknowledge cleanup</p>
            <div className="space-y-1">
              <label className="text-xs text-text_medium">I will delete / anonymise this file by:</label>
              <input
                type="date"
                min={min_date}
                value={cleanup_deadline}
                onChange={e => set_cleanup_deadline(e.target.value)}
                className="w-full rounded-md border border-border_grey bg-white px-2.5 py-1.5 text-sm text-text_dark focus:border-bosch_blue focus:outline-none dark:bg-slate-800"
              />
            </div>
            <Textarea placeholder="Optional note" value={cleanup_note} onChange={e => set_cleanup_note(e.target.value)} />
            <Button
              variant="outline"
              disabled={!cleanup_deadline}
              className="w-full"
              onClick={() => on_apply_action(finding.id, "mark_false_positive", cleanup_note.trim(), { cleanup_deadline })}
            >
              Acknowledge cleanup by {cleanup_deadline || "…"}
            </Button>
          </div>

          {/* Delete file */}
          <div className="rounded-lg border border-red-200 bg-red-50/50 p-3 space-y-2 dark:border-red-500/20 dark:bg-red-500/5">
            <p className="text-xs font-semibold uppercase tracking-wide text-bosch_red">Delete file permanently</p>
            <p className="text-xs text-text_medium">This removes the file from disk. This action cannot be undone.</p>
            {!delete_confirm ? (
              <Button variant="destructive" className="w-full" onClick={() => set_delete_confirm(true)}>
                Delete file
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="destructive" className="flex-1" onClick={() => {
                  set_delete_confirm(false);
                  on_apply_action(finding.id, "delete", "", {});
                }}>
                  Yes, delete permanently
                </Button>
                <Button variant="outline" onClick={() => set_delete_confirm(false)}>Cancel</Button>
              </div>
            )}
          </div>
        </div>
      )}

      {finding.review_status !== "pending" && (
        <div className="rounded-lg border border-border_grey p-3 space-y-1">
          {finding.legal_basis && (
            <p className="text-xs text-text_medium">Legal basis: <span className="font-medium text-text_dark">{finding.legal_basis}</span></p>
          )}
          {finding.cleanup_deadline && (
            <p className="text-xs text-text_medium">Cleanup deadline: <span className="font-medium text-text_dark">{finding.cleanup_deadline.split("T")[0]}</span></p>
          )}
          {finding.review_note && (
            <p className="text-xs text-text_medium">Note: <span className="text-text_dark">{finding.review_note}</span></p>
          )}
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
