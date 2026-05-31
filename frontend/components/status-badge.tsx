import { Badge } from "@/components/ui/badge";
import { format_review_status } from "@/lib/utils";

type StatusKind =
  | "pending"
  | "confirmed_business_need"
  | "acknowledged_cleanup"
  | "kept_business_need"
  | "marked_false_positive"
  | "deleted"
  | "cleanup_overdue"
  | "high"
  | "medium"
  | "low"
  | "running"
  | "completed"
  | "failed"
  | "direct"
  | "master_of_data";

export function StatusBadge({ value, size = "default" }: { value: StatusKind; size?: "default" | "large" }) {
  let class_name = "border-slate-400 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200";

  if (value === "pending") {
    class_name = "border-amber-500 bg-amber-100 text-amber-900 dark:border-amber-500/50 dark:bg-amber-500/20 dark:text-amber-300";
  } else if (value === "confirmed_business_need" || value === "kept_business_need") {
    class_name = "border-blue-600 bg-blue-100 text-blue-800 dark:border-blue-400/50 dark:bg-blue-500/20 dark:text-blue-300";
  } else if (value === "acknowledged_cleanup" || value === "marked_false_positive") {
    class_name = "border-emerald-600 bg-emerald-100 text-emerald-800 dark:border-emerald-400/50 dark:bg-emerald-500/20 dark:text-emerald-300";
  } else if (value === "cleanup_overdue") {
    class_name = "border-orange-500 bg-orange-100 text-orange-800 dark:border-orange-400/50 dark:bg-orange-500/20 dark:text-orange-300";
  } else if (value === "deleted") {
    class_name = "border-red-600 bg-red-100 text-red-800 dark:border-red-400/50 dark:bg-red-500/20 dark:text-red-300";
  } else if (value === "high") {
    class_name = "border-red-600 bg-red-100 text-red-800 dark:border-red-400/50 dark:bg-red-500/20 dark:text-red-300";
  } else if (value === "medium") {
    class_name = "border-amber-500 bg-amber-100 text-amber-900 dark:border-amber-500/50 dark:bg-amber-500/20 dark:text-amber-300";
  } else if (value === "low") {
    class_name = "border-emerald-600 bg-emerald-100 text-emerald-800 dark:border-emerald-400/50 dark:bg-emerald-500/20 dark:text-emerald-300";
  } else if (value === "running") {
    class_name = "border-cyan-600 bg-cyan-100 text-cyan-800 dark:border-cyan-400/50 dark:bg-cyan-500/20 dark:text-cyan-300";
  } else if (value === "completed") {
    class_name = "border-emerald-600 bg-emerald-100 text-emerald-800 dark:border-emerald-400/50 dark:bg-emerald-500/20 dark:text-emerald-300";
  } else if (value === "failed") {
    class_name = "border-red-600 bg-red-100 text-red-800 dark:border-red-400/50 dark:bg-red-500/20 dark:text-red-300";
  } else if (value === "master_of_data") {
    class_name = "border-purple-600 bg-purple-100 text-purple-800 dark:border-purple-400/50 dark:bg-purple-500/20 dark:text-purple-300";
  } else if (value === "direct") {
    class_name = "border-slate-500 bg-slate-100 text-slate-700 dark:border-slate-500 dark:bg-slate-600/50 dark:text-slate-200";
  }

  const size_class_name = size === "large" ? "h-6 px-2.5 text-xs whitespace-nowrap" : "whitespace-nowrap";
  return <Badge className={`font-semibold ${size_class_name} ${class_name}`}>{format_review_status(value)}</Badge>;
}
