"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { use_app_state } from "@/context/app-state";
import { get_audit_log } from "@/src/lib/api-client";
import { format_timestamp } from "@/lib/utils";
import { AuditEntry } from "@/types/models";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(/\/+$/, "");

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
          <div className="flex items-center justify-between">
            <CardTitle>
              Review actions
              {loaded && (
                <span className="ml-2 text-sm font-normal text-text_medium">({entries.length} total)</span>
              )}
            </CardTitle>
            <div className="flex gap-2">
              <a
                href={`${API_BASE_URL}/findings/export?format=csv`}
                download
                className="inline-flex items-center gap-1.5 rounded-lg border border-border_grey bg-white px-3 py-1.5 text-xs font-medium text-text_dark shadow-sm transition-colors hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700"
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </a>
              <a
                href={`${API_BASE_URL}/findings/export?format=json`}
                download
                className="inline-flex items-center gap-1.5 rounded-lg border border-border_grey bg-white px-3 py-1.5 text-xs font-medium text-text_dark shadow-sm transition-colors hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700"
              >
                <Download className="h-3.5 w-3.5" />
                Export JSON
              </a>
            </div>
          </div>
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
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  >
                    <TableCell className="whitespace-nowrap font-medium text-text_dark">
                      {format_timestamp(entry.timestamp)}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded-md border border-border_grey px-2 py-0.5 font-mono text-xs font-medium text-text_dark">
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
