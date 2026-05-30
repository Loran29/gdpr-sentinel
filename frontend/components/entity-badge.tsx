import { Badge } from "@/components/ui/badge";

export function EntityBadge({ type }: { type: string }) {
  return <Badge className="border-slate-300 bg-slate-100 font-mono text-slate-800">{type}</Badge>;
}
