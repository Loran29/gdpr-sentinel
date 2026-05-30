import { forwardRef, InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-9 w-full rounded-lg border border-border_grey bg-card_bg px-2.5 text-[15px] text-text_dark placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-bosch_red/20",
        className
      )}
      {...props}
    />
  );
});
