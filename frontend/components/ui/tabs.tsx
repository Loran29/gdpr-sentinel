"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Tabs({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn(className)}>{children}</div>;
}

export function TabsList({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("inline-flex rounded-lg border border-border_grey bg-slate-50 p-0.5", className)}>
      {children}
    </div>
  );
}

export function TabsTrigger({
  className,
  active,
  children,
  onClick
}: {
  className?: string;
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      className={cn(
        "rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors",
        active ? "bg-card_bg text-text_dark shadow-sm" : "text-text_medium hover:bg-slate-100 hover:text-text_dark",
        className
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

export function TabsContent({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn(className)}>{children}</div>;
}
