import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "secondary" | "outline";

export function Badge({
  className,
  variant = "default",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  const variant_class =
    variant === "default"
      ? "border-slate-300 bg-slate-100 text-slate-800"
      : variant === "secondary"
        ? "border-slate-300 bg-slate-100 text-slate-700"
        : "border-border_grey bg-card_bg text-text_dark";

  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-md border px-2 py-0 text-[11px] font-semibold tracking-wide",
        variant_class,
        className
      )}
      {...props}
    />
  );
}
