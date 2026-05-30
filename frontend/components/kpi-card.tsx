import { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function KpiCard({
  icon: Icon,
  label,
  value,
  subtitle,
  value_class_name
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  subtitle?: string;
  value_class_name?: string;
}) {
  return (
    <Card className="flex h-full min-h-[122px] flex-col p-3.5">
      <CardHeader className="mb-2 flex flex-row items-start justify-between border-b-0 pb-0">
        <CardTitle className="text-[11px] uppercase tracking-wide text-text_medium">{label}</CardTitle>
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-bosch_blue/25 bg-bosch_blue/10">
          <Icon className="h-4 w-4 text-bosch_blue" />
        </span>
      </CardHeader>
      <CardContent className="mt-auto">
        <p
          className={`text-[25px] font-semibold leading-none tabular-nums text-text_dark ${value_class_name ?? ""}`}
        >
          {value}
        </p>
        {subtitle ? <p className="mt-1 text-xs text-text_medium">{subtitle}</p> : null}
      </CardContent>
    </Card>
  );
}
