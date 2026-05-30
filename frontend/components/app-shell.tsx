"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SidebarNav } from "@/components/sidebar-nav";
import { TopBar } from "@/components/top-bar";
import { RunScanDialog } from "@/components/run-scan-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { use_app_state } from "@/context/app-state";

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { users, selected_user, is_app_state_ready, sign_in } = use_app_state();
  const [dialog_open, set_dialog_open] = useState(false);
  const [login_user_id, set_login_user_id] = useState("");
  const [login_password, set_login_password] = useState("");
  const [show_password_error, set_show_password_error] = useState(false);

  const default_user_id = useMemo(() => users[0]?.id ?? "", [users]);

  useEffect(() => {
    if (!is_app_state_ready) {
      return;
    }

    if (!selected_user) {
      if (pathname !== "/login") {
        router.replace("/login");
      }
      return;
    }

    if (pathname === "/login") {
      router.replace(selected_user.role === "admin" ? "/admin-dashboard" : "/my-findings");
      return;
    }

    if (selected_user.role === "employee") {
      const employee_allowed = pathname === "/my-findings";
      if (!employee_allowed) {
        router.replace("/my-findings");
      }
    }
  }, [is_app_state_ready, pathname, router, selected_user]);

  useEffect(() => {
    if (!default_user_id) {
      return;
    }

    const still_exists = users.some((user) => user.id === login_user_id);
    if (!login_user_id || !still_exists) {
      set_login_user_id(default_user_id);
    }
  }, [default_user_id, login_user_id, users]);

  const handle_sign_in = () => {
    if (!login_user_id) {
      return;
    }

    if (!login_password.trim()) {
      set_show_password_error(true);
      return;
    }

    set_show_password_error(false);
    const next_user = users.find((user) => user.id === login_user_id);
    if (!next_user) {
      return;
    }

    sign_in(next_user.id);
    window.location.assign(next_user.role === "admin" ? "/admin-dashboard" : "/my-findings");
  };

  if (!is_app_state_ready) {
    return (
      <div className="min-h-screen bg-page_bg">
        <div className="h-1 w-full bg-[linear-gradient(90deg,#E00420_0_20%,#7A1FA2_20%_40%,#005691_40%_60%,#00A8E1_60%_80%,#00884A_80%_100%)]" />
      </div>
    );
  }

  if (!selected_user) {
    return (
      <div className="min-h-screen bg-page_bg">
        <div className="h-1 w-full bg-[linear-gradient(90deg,#E00420_0_20%,#7A1FA2_20%_40%,#005691_40%_60%,#00A8E1_60%_80%,#00884A_80%_100%)]" />
        <main className="mx-auto flex min-h-[calc(100vh-4px)] w-full max-w-5xl items-center justify-center p-4">
          <Card className="w-full max-w-md border border-border_grey shadow-sm">
            <CardHeader className="space-y-2">
              <CardTitle className="text-2xl font-semibold text-text_dark">GDPR Sentinel</CardTitle>
              <p className="text-sm text-text_medium">Internal data discovery review portal</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-text_medium">User</label>
                <Select value={login_user_id} onChange={(event) => set_login_user_id(event.target.value)}>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-text_medium">Password</label>
                <Input
                  type="password"
                  value={login_password}
                  onChange={(event) => {
                    const next_password = event.target.value;
                    set_login_password(next_password);
                    if (next_password.trim()) {
                      set_show_password_error(false);
                    }
                  }}
                  placeholder="Enter password"
                />
                {show_password_error ? (
                  <p className="text-xs font-medium text-red-600">Please enter password to continue</p>
                ) : null}
              </div>
              <Button type="button" className="w-full" onClick={handle_sign_in}>
                Sign in
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-page_bg">
      <div className="h-1 w-full bg-[linear-gradient(90deg,#E00420_0_20%,#7A1FA2_20%_40%,#005691_40%_60%,#00A8E1_60%_80%,#00884A_80%_100%)]" />
      <div className="flex h-[calc(100vh-4px)] min-h-0 overflow-hidden">
        <SidebarNav />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <TopBar on_open_run_scan={() => set_dialog_open(true)} />
          <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 lg:p-5">{children}</main>
        </div>
      </div>
      <RunScanDialog open={dialog_open} onOpenChange={set_dialog_open} />
    </div>
  );
}
