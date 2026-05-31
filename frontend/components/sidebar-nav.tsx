"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ChevronLeft,
  FileSearch,
  Fingerprint,
  Gauge,
  LayoutList,
  Users
} from "lucide-react";
import { app_nav_items } from "@/lib/mock-data";
import { use_app_state } from "@/context/app-state";
import { cn } from "@/lib/utils";
import { useState } from "react";

const nav_items_by_href = {
  "/run-scan": { icon: Activity, is_admin_view: true },
  "/my-findings": { icon: FileSearch, is_admin_view: false },
  "/admin-dashboard": { icon: Gauge, is_admin_view: true },
  "/all-findings": { icon: LayoutList, is_admin_view: true },
  "/data-owners": { icon: Users, is_admin_view: true },
  "/audit-log": { icon: Fingerprint, is_admin_view: true }
} as const;

export function SidebarNav() {
  const { selected_user } = use_app_state();
  const pathname = usePathname();
  const is_admin = selected_user?.role === "admin";
  const [collapsed, set_collapsed] = useState(false);

  const visible_nav_items = app_nav_items.filter((item) => {
    if (is_admin) return true;
    return item.href === "/my-findings";
  });

  return (
    <aside
      className={cn(
        "relative flex shrink-0 flex-col border-r border-slate-700/90 bg-charcoal text-slate-100 transition-all duration-300 ease-in-out",
        collapsed ? "w-14" : "w-64"
      )}
    >
      {/* Header */}
      <div className={cn(
        "flex items-center border-b border-slate-700 py-4 transition-all duration-300",
        collapsed ? "justify-center px-0" : "justify-between px-4"
      )}>
        {!collapsed && (
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-300">Navigation</p>
        )}
        <button
          onClick={() => set_collapsed(!collapsed)}
          className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronLeft className={cn("h-4 w-4 transition-transform duration-300", collapsed && "rotate-180")} />
        </button>
      </div>

      {/* Nav items */}
      <nav className="space-y-1.5 px-2 py-3">
        {visible_nav_items.map((item) => {
          const nav_metadata = nav_items_by_href[item.href as keyof typeof nav_items_by_href];
          const Icon = nav_metadata?.icon ?? FileSearch;
          const active = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center rounded-lg px-2 py-2 text-sm font-medium transition-colors",
                collapsed ? "justify-center gap-0" : "gap-2.5",
                active
                  ? "border-l-4 border-bosch_red bg-slate-800/95 text-white shadow-[inset_0_0_0_1px_rgba(148,163,184,0.2)]"
                  : "border-l-4 border-transparent text-slate-300 hover:bg-slate-800/80 hover:text-white"
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", active ? "text-bosch_red" : "text-slate-400")} />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
