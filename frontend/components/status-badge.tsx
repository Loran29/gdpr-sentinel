import { Badge } from "@/components/ui/badge";
import { format_review_status } from "@/lib/utils";

type StatusKind =
  | "pending"
  | "confirmed_business_need"
  | "acknowledged_cleanup"
  | "kept_business_need"
  | "marked_false_positive"
  | "deleted"
  | "high"
  | "medium"
  | "low"
  | "running"
  | "completed"
  | "failed"
  | "direct"
  | "master_of_data";

export function StatusBadge({ value, size = "default" }: { value: StatusKind; size?: "default" | "large" }) {
  let class_name = "border-slate-300 bg-slate-100 text-slate-700";

  if (value === "pending") {
    class_name = "border-warning_yellow/45 bg-warning_yellow/20 text-amber-900";
  } else if (value === "confirmed_business_need" || value === "kept_business_need") {
    class_name = "border-bosch_blue/35 bg-bosch_blue/10 text-bosch_blue";
  } else if (value === "acknowledged_cleanup" || value === "marked_false_positive") {
    class_name = "border-success_green/40 bg-success_green/15 text-success_green";
  } else if (value === "deleted") {
    class_name = "border-bosch_red/40 bg-bosch_red/15 text-bosch_red";
  } else if (value === "high") {
    class_name = "border-bosch_red/40 bg-bosch_red/15 text-bosch_red";
  } else if (value === "medium") {
    class_name = "border-warning_yellow/45 bg-warning_yellow/20 text-amber-900";
  } else if (value === "low") {
    class_name = "border-success_green/40 bg-success_green/15 text-success_green";
  } else if (value === "running") {
    class_name = "border-process_cyan/40 bg-process_cyan/15 text-bosch_blue";
  } else if (value === "completed") {
    class_name = "border-success_green/40 bg-success_green/15 text-success_green";
  } else if (value === "failed") {
    class_name = "border-bosch_red/40 bg-bosch_red/15 text-bosch_red";
  } else if (value === "master_of_data") {
    class_name = "border-master_purple/40 bg-master_purple/15 text-master_purple";
  } else if (value === "direct") {
    class_name = "border-slate-300 bg-slate-100 text-slate-700";
  }

  const size_class_name = size === "large" ? "h-6 px-2.5 text-xs" : "";
  return <Badge className={`font-semibold ${size_class_name} ${class_name}`}>{format_review_status(value)}</Badge>;
}
