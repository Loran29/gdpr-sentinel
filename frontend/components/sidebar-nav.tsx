"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  FileSearch,
  Fingerprint,
  Gauge,
  Users
} from "lucide-react";
import { app_nav_items } from "@/lib/mock-data";
import { use_app_state } from "@/context/app-state";
import { cn } from "@/lib/utils";

const nav_items_by_href = {
  "/run-scan": { icon: Activity, is_admin_view: true },
  "/my-findings": { icon: FileSearch, is_admin_view: false },
  "/admin-dashboard": { icon: Gauge, is_admin_view: true },
  "/data-owners": { icon: Users, is_admin_view: true },
  "/audit-log": { icon: Fingerprint, is_admin_view: true }
} as const;

export function SidebarNav() {
  const { selected_user } = use_app_state();
  const pathname = usePathname();
  const is_admin = selected_user?.role === "admin";

  const visible_nav_items = app_nav_items.filter((item) => {
    if (is_admin) {
      return true;
    }

    return item.href === "/my-findings";
  });

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-700/90 bg-charcoal text-slate-100">
      <div className="border-b border-slate-700 px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-300">Navigation</p>
      </div>
      <nav className="space-y-1.5 px-2.5 py-3">
        {visible_nav_items.map((item) => {
          const nav_metadata = nav_items_by_href[item.href as keyof typeof nav_items_by_href];
          const Icon = nav_metadata?.icon ?? FileSearch;
          const active = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-l-4 border-bosch_red bg-slate-800/95 text-white shadow-[inset_0_0_0_1px_rgba(148,163,184,0.2)]"
                  : "border-l-4 border-transparent text-slate-300 hover:bg-slate-800/80 hover:text-white"
              )}
            >
              <Icon className={cn("h-4 w-4", active ? "text-bosch_red" : "text-slate-400")} />
              <span>{item.label}</span>
              {is_admin && nav_metadata?.is_admin_view ? (
                <span className="ml-auto rounded-md border border-slate-500 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
                  Admin
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
