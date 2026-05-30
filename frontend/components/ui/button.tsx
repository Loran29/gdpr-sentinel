import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "outline" | "secondary" | "destructive";
type ButtonSize = "default" | "sm";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const variant_classes: Record<ButtonVariant, string> = {
  default: "border border-bosch_red bg-bosch_red text-white shadow-sm hover:bg-red-700",
  outline: "border border-border_grey bg-card_bg text-text_dark hover:bg-slate-50",
  secondary: "border border-slate-700 bg-charcoal text-white shadow-sm hover:bg-slate-700",
  destructive: "border border-bosch_red bg-bosch_red text-white shadow-sm hover:bg-red-800"
};

const size_classes: Record<ButtonSize, string> = {
  default: "h-9 px-3.5 text-[13px]",
  sm: "h-8 px-3 text-xs"
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "default", size = "default", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bosch_red/30 disabled:cursor-not-allowed disabled:opacity-50",
        variant_classes[variant],
        size_classes[size],
        className
      )}
      {...props}
    />
  );
});
