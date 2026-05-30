"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { use_app_state } from "@/context/app-state";
import { get_audit_log } from "@/src/lib/api-client";
import { format_timestamp } from "@/lib/utils";
import { AuditEntry } from "@/types/models";

export function AuditLogPage() {
  const { audit_entries: context_entries } = use_app_state();
  const [api_entries, set_api_entries] = useState<AuditEntry[]>([]);
  const [loaded, set_loaded] = useState(false);

  useEffect(() => {
    let is_cancelled = false;
    const load = async () => {
      const result = await get_audit_log();
      if (!is_cancelled) {
        set_api_entries(result);
        set_loaded(true);
      }
    };
    load();
    return () => { is_cancelled = true; };
  }, []);

  const api_ids = new Set(api_entries.map((e) => e.finding_id));
  const session_only = context_entries.filter((e) => !api_ids.has(e.finding_id));
  const entries = [...session_only, ...api_entries];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-text_dark">Audit log</h1>
        <p className="mt-1 text-sm text-text_medium">Review action history and resulting status changes.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Review actions
            {loaded && (
              <span className="ml-2 text-sm font-normal text-text_medium">({entries.length} total)</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-auto rounded-lg border border-border_grey/80 bg-card_bg p-0">
          <Table className="min-w-[980px]">
            <TableHeader className="sticky top-0 z-10">
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Finding ID</TableHead>
                <TableHead>File name</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Review note</TableHead>
                <TableHead>Resulting status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-text_medium">
                    {loaded ? "No review actions recorded yet." : "Loading audit log..."}
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((entry, index) => (
                  <TableRow
                    key={entry.id ?? `${entry.finding_id}_${index}`}
                    className={index % 2 === 0 ? "bg-white hover:bg-slate-50" : "bg-slate-50/35 hover:bg-slate-50"}
                  >
                    <TableCell className="whitespace-nowrap font-medium text-text_dark">
                      {format_timestamp(entry.timestamp)}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded-md border border-border_grey bg-slate-50 px-2 py-0.5 text-sm font-medium text-text_dark">
                        {entry.finding_id}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">{entry.file_name}</TableCell>
                    <TableCell>{entry.user}</TableCell>
                    <TableCell className="max-w-[380px] text-sm leading-5 text-text_medium">
                      {entry.review_note || "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={entry.resulting_status} size="large" />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
