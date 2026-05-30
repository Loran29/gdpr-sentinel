"use client";

import { useEffect, useMemo, useState } from "react";
import { Finding } from "@/types/models";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    review_status: "confirmed_business_need" | "acknowledged_cleanup" | "delete",
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
      <Card className="h-full">
        <CardContent className="flex h-full items-center justify-center text-center text-sm text-text_medium">
          Select a finding to view details.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Finding detail</CardTitle>
        <p className="text-xs text-text_medium">
          Automated deletion is disabled. Review decisions are user-approved.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-border_grey p-3">
          <table className="w-full text-sm">
            <tbody>
              {[
                { label: "File name",       value: finding.file_name,                   mono: false },
                { label: "File path",       value: finding.file_path,                   mono: true  },
                { label: "SHA-256",         value: `${finding.file_sha256.slice(0, 16)}...`, mono: true },
                { label: "Document type",   value: format_document_type(finding.document_type), mono: false },
                { label: "Owner",           value: finding.owner_name ?? "—",           mono: false },
                { label: "Master of Data",  value: finding.master_of_data_id ?? "—",    mono: true  },
                { label: "Scanned",         value: format_timestamp(finding.scan_timestamp), mono: true },
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
              <tr className="border-b border-border_grey/40">
                <td className="w-36 py-1.5 pr-3 align-middle text-[11px] font-semibold uppercase tracking-wide text-text_medium">
                  Sensitivity
                </td>
                <td className="py-1.5 align-middle">
                  <StatusBadge value={finding.sensitivity_level} />
                </td>
              </tr>
              <tr className="border-b border-border_grey/40">
                <td className="w-36 py-1.5 pr-3 align-middle text-[11px] font-semibold uppercase tracking-wide text-text_medium">
                  Owner type
                </td>
                <td className="py-1.5 align-middle">
                  <StatusBadge value={finding.owner_type} />
                </td>
              </tr>
              <tr>
                <td className="w-36 py-1.5 pr-3 align-middle text-[11px] font-semibold uppercase tracking-wide text-text_medium">
                  Review status
                </td>
                <td className="py-1.5 align-middle">
                  <StatusBadge value={finding.review_status} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <Separator />

        <div className="rounded-lg border border-border_grey p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text_medium">Reasoning</p>
          <p className="text-sm text-text_dark">{finding.reasoning}</p>
        </div>

        <div className="rounded-lg border border-border_grey p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text_medium">
            Retention recommendation
          </p>
          <p className="text-sm text-text_dark">{finding.retention_recommendation}</p>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text_medium">Entities</p>
          <EntityTable entities={finding.entities} />
        </div>

        <div className="rounded-lg border border-border_grey bg-slate-100 p-4">
          <p className="text-sm text-text_medium">
            PDF preview placeholder.
          </p>
          {preview_url ? <p className="mt-2 break-all font-mono text-xs text-text_medium">{preview_url}</p> : null}
        </div>

        <Separator />

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
              onClick={() => on_apply_action(finding.id, "confirmed_business_need", review_note.trim())}
            >
              Confirm business need
            </Button>
            <Button
              variant="outline"
              disabled={!note_is_valid}
              onClick={() => on_apply_action(finding.id, "acknowledged_cleanup", review_note.trim())}
            >
              Acknowledge cleanup
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
