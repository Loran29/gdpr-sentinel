import { OwnerSummary } from "@/types/models";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function OwnerTable({ owners }: { owners: OwnerSummary[] }) {
  return (
    <Table className="min-w-[920px]">
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Assigned sources</TableHead>
          <TableHead className="text-right">Files assigned</TableHead>
          <TableHead className="text-right">Pending reviews</TableHead>
          <TableHead className="text-right">Completed reviews</TableHead>
          <TableHead>Suggested next step</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {owners.map((owner) => (
          <TableRow key={owner.user_id} className="hover:bg-slate-50/80">
            <TableCell className="font-medium text-text_dark">{owner.name}</TableCell>
            <TableCell>
              <StatusBadge value={owner.type} />
            </TableCell>
            <TableCell>
              <div className="space-y-1">
                {owner.assigned_sources.map((source) => (
                  <p className="font-mono text-[13px]" key={source}>
                    {source}
                  </p>
                ))}
              </div>
            </TableCell>
            <TableCell className="text-right">{owner.files_assigned}</TableCell>
            <TableCell className="text-right">
              <span className={owner.pending_reviews > 0 ? "font-semibold text-bosch_red" : "text-text_dark"}>
                {owner.pending_reviews}
              </span>
            </TableCell>
            <TableCell className="text-right text-success_green">{owner.completed_reviews}</TableCell>
            <TableCell className="text-sm text-text_medium">
              {owner.pending_reviews > 0
                ? "Prioritize pending review queue"
                : "Maintain periodic review cadence"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
