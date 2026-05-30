import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OwnerTable } from "@/components/owner-table";
import { owner_summaries } from "@/lib/mock-data";

export function DataOwnersPage() {
  const owners = owner_summaries;

  const direct_owners = owners.filter((owner) => owner.type === "direct").length;
  const masters_of_data = owners.filter((owner) => owner.type === "master_of_data").length;
  const pending_reviews = owners.reduce((sum, owner) => sum + owner.pending_reviews, 0);
  const completed_reviews = owners.reduce((sum, owner) => sum + owner.completed_reviews, 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-text_dark">Data owners and Masters of Data</h1>
        <p className="mt-1 text-sm text-text_medium">Ownership routing and review workload by assignee.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard title="Direct owners" value={direct_owners} />
        <SummaryCard title="Masters of Data" value={masters_of_data} />
        <SummaryCard title="Pending reviews" value={pending_reviews} accent="text-bosch_red" />
        <SummaryCard title="Completed reviews" value={completed_reviews} accent="text-success_green" />
        <SummaryCard title="Orphan files routed to default Master of Data" value={1} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Owner routing summary</CardTitle>
        </CardHeader>
        <CardContent className="overflow-auto">
          <OwnerTable owners={owners} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Routing rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-text_dark">
          <p>1. If path matches <span className="font-mono">/data/onedrive/{"{username}"}/</span>, route to direct owner.</p>
          <p>
            2. Else if path is under a configured Master of Data source, route to that Master of Data.
          </p>
          <p>3. Else route to default Master of Data.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ title, value, accent }: { title: string; value: number; accent?: string }) {
  return (
    <Card className="p-3">
      <p className="text-[11px] uppercase tracking-wide text-text_medium">{title}</p>
      <p className={`mt-1 text-2xl font-semibold leading-none ${accent ?? "text-text_dark"}`}>{value}</p>
    </Card>
  );
}
