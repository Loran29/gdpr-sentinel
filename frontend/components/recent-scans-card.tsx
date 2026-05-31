import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DashboardStats } from "@/types/models";
import { format_timestamp_short, format_timestamp } from "@/lib/utils";

export function RecentScansCard({ recent_scans }: { recent_scans: DashboardStats["recent_scans"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent scans</CardTitle>
      </CardHeader>
      <CardContent className="overflow-auto">
        <Table className="min-w-[700px]">
          <TableHeader>
            <TableRow>
              <TableHead>Scan ID</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Completed</TableHead>
              <TableHead className="text-right">Duration</TableHead>
              <TableHead className="text-right">Processed</TableHead>
              <TableHead className="text-right">Skipped</TableHead>
              <TableHead className="text-right">Findings</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recent_scans.map((scan) => (
              <TableRow key={scan.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                <TableCell className="font-mono text-[12px] text-text_medium">{scan.id.slice(-10)}</TableCell>
                <TableCell>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    scan.scan_type === "delta"
                      ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300"
                      : "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300"
                  }`}>
                    {scan.scan_type ?? "full"}
                  </span>
                </TableCell>
                <TableCell
                  className="text-sm text-text_dark"
                  title={scan.completed_at ? format_timestamp(scan.completed_at) : ""}
                >
                  {scan.completed_at ? format_timestamp_short(scan.completed_at) : "—"}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">{scan.duration_sec.toFixed(1)}s</TableCell>
                <TableCell className="text-right tabular-nums">{scan.files_processed}</TableCell>
                <TableCell className="text-right tabular-nums text-text_medium">{scan.files_skipped ?? 0}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums text-bosch_red">
                  {scan.findings_count}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
