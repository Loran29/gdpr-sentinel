"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { SidebarNav } from "@/components/sidebar-nav";
import { TopBar } from "@/components/top-bar";
import { RunScanDialog } from "@/components/run-scan-dialog";
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
  const [show_password, set_show_password] = useState(false);

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
      <div className="relative min-h-screen overflow-hidden" style={{ background: "linear-gradient(135deg, #f8f9fb 0%, #eef1f7 100%)" }}>

        {/* Subtle grid pattern */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000'%3E%3Cpath d='M0 0h1v40H0zm40 0h-1v40h1zM0 0v1h40V0zm0 40v-1h40v1z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }}
        />

        {/* Bosch colour bar */}
        <div className="relative h-[3px] w-full bg-[linear-gradient(90deg,#E00420_0_20%,#7A1FA2_20%_40%,#005691_40%_60%,#00A8E1_60%_80%,#00884A_80%_100%)]" />

        <main className="relative flex min-h-[calc(100vh-3px)] w-full items-center justify-center p-6">
          <div className="w-full max-w-[920px]">

            {/* Card */}
            <div className="overflow-hidden rounded-2xl shadow-[0_20px_60px_-10px_rgba(0,0,0,0.15)] lg:grid lg:grid-cols-[1fr_1.1fr]">

              {/* Left panel — deep navy */}
              <div className="relative flex flex-col items-center justify-center overflow-hidden p-10" style={{ background: "linear-gradient(160deg, #E00420 0%, #9b0016 60%, #6b000f 100%)" }}>

                {/* Decorative circles */}
                <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" />
                <div className="pointer-events-none absolute -bottom-12 -left-12 h-44 w-44 rounded-full bg-black/20" />
                <div className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/[0.03]" />

                {/* Centered content */}
                <div className="relative flex flex-col items-center text-center">
                  {/* Shield icon */}
                  <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 shadow-lg shadow-black/20 backdrop-blur-sm">
                    <svg className="h-9 w-9 fill-white" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 4l5 2.18V11c0 3.5-2.33 6.79-5 7.93-2.67-1.14-5-4.43-5-7.93V7.18L12 5zm-1 3v4h2V8h-2zm0 6v2h2v-2h-2z"/>
                    </svg>
                  </div>

                  <h1 className="text-4xl font-bold tracking-tight text-white">GDPR Sentinel</h1>
                  <p className="mt-3 text-sm font-medium text-white/70">Internal data discovery review portal</p>
                </div>

                <p className="absolute bottom-6 text-[11px] text-white/60">TechOn 2026 · Challenge 03 · Bosch</p>
              </div>

              {/* Right panel — clean white */}
              <div className="flex flex-col justify-center bg-white px-10 py-12">

                {/* Header */}
                <div className="mb-8">
                  <p className="text-xs font-semibold uppercase tracking-widest text-[#E00420]">Internal portal</p>
                  <h2 className="mt-1.5 text-[26px] font-bold text-slate-900">Welcome back</h2>
                  <p className="mt-1 text-sm text-slate-500">Sign in to access your review queue</p>
                </div>

                {/* Form */}
                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                      User account
                    </label>
                    <Select value={login_user_id} onChange={(event) => set_login_user_id(event.target.value)}>
                      {users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name} — {user.role === "admin" ? "Admin" : "Employee"}
                        </SelectItem>
                      ))}
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                        Password
                      </label>
                    </div>
                    <div className="relative">
                      <Input
                        type={show_password ? "text" : "password"}
                        value={login_password}
                        onChange={(event) => {
                          const next_password = event.target.value;
                          set_login_password(next_password);
                          if (next_password.trim()) set_show_password_error(false);
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter") handle_sign_in(); }}
                        className="h-11 border-slate-200 pr-10 focus:border-[#005691] focus:ring-[#005691]/20"
                      />
                      <button
                        type="button"
                        onClick={() => set_show_password(!show_password)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        tabIndex={-1}
                      >
                        {show_password ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {show_password_error ? (
                      <p className="flex items-center gap-1 text-xs font-medium text-red-600">
                        <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                        Please enter a password to continue
                      </p>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={handle_sign_in}
                    className="group mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#E00420] text-sm font-semibold text-white transition-all hover:bg-[#c40019] active:scale-[0.99]"
                    style={{ boxShadow: "0 4px 14px rgba(224,4,32,0.35)" }}
                  >
                    Sign in to portal
                    <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
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
