import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DashboardStats } from "@/types/models";

export function RecentScansCard({ recent_scans }: { recent_scans: DashboardStats["recent_scans"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent scans</CardTitle>
      </CardHeader>
      <CardContent className="overflow-auto">
        <Table className="min-w-[860px]">
          <TableHeader>
            <TableRow>
              <TableHead>scan_id</TableHead>
              <TableHead>scan_type</TableHead>
              <TableHead>completed_at</TableHead>
              <TableHead className="text-right">duration</TableHead>
              <TableHead className="text-right">processed</TableHead>
              <TableHead className="text-right">skipped</TableHead>
              <TableHead className="text-right">findings</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recent_scans.map((scan) => (
              <TableRow key={scan.id} className="hover:bg-slate-50/80">
                <TableCell className="font-mono text-[13px]">{scan.id}</TableCell>
                <TableCell className="font-mono text-[13px]">{scan.scan_type ?? "full"}</TableCell>
                <TableCell className="font-mono text-[13px]">{scan.completed_at}</TableCell>
                <TableCell className="text-right font-medium">{scan.duration_sec}s</TableCell>
                <TableCell className="text-right font-medium">{scan.files_processed}</TableCell>
                <TableCell className="text-right font-medium">{scan.files_skipped ?? 0}</TableCell>
                <TableCell className="text-right font-medium">{scan.findings_count}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
