"use client";

import { LogOut, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { UserSwitcher } from "@/components/user-switcher";
import { use_app_state } from "@/context/app-state";

export function TopBar({ on_open_run_scan }: { on_open_run_scan: () => void }) {
  const { logout } = use_app_state();

  return (
    <header className="border-b border-border_grey bg-card_bg px-4 py-2.5 shadow-[0_1px_0_rgba(15,23,42,0.04)] lg:px-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-bosch_red/25 bg-bosch_red/10 p-1.5 text-bosch_red">
            <Shield className="h-4 w-4" />
          </div>
          <div>
            <p className="text-base font-semibold text-text_dark">GDPR Sentinel</p>
            <p className="text-xs text-text_medium">Internal data discovery review portal</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <ThemeSwitcher />
          <UserSwitcher />
          <Badge className="border-slate-300 bg-slate-100 uppercase text-slate-700">Mock mode</Badge>
          <Button onClick={on_open_run_scan}>Run new scan</Button>
          <Button variant="outline" onClick={logout} className="gap-1.5">
            <LogOut className="h-3.5 w-3.5" />
            Logout
          </Button>
        </div>
      </div>
    </header>
  );
}
