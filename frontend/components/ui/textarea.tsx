import { forwardRef, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          "min-h-24 w-full rounded-lg border border-border_grey bg-card_bg px-2.5 py-2 text-[15px] text-text_dark placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-bosch_red/20",
          className
        )}
        {...props}
      />
    );
  }
);
