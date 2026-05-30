import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { architecture_strip_steps, overview_summary_items } from "@/lib/mock-data";

export function OverviewPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-text_dark">Overview</h1>
        <p className="mt-1 text-sm text-text_medium">Operational summary for GDPR data discovery and routing.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {overview_summary_items.map((item) => (
          <Card key={item.title} className="p-3">
            <CardHeader className="mb-2 border-b-0 pb-0">
              <CardTitle>{item.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-text_medium">{item.text}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Processing pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            {architecture_strip_steps.map((step, index) => (
              <div key={step} className="flex items-center gap-2">
                <span className="rounded-md border border-border_grey bg-slate-50 px-3 py-1 text-xs text-text_dark">
                  {step}
                </span>
                {index < architecture_strip_steps.length - 1 ? (
                  <span className="text-xs text-text_medium">-&gt;</span>
                ) : null}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
