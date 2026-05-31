"use client";

import { useCallback, useRef, useState } from "react";
import { FileUp, Loader2, Upload, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectItem } from "@/components/ui/select";
import { get_scan } from "@/src/lib/api-client";
import { use_app_state } from "@/context/app-state";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(/\/+$/, "");

type UploadState = "idle" | "uploading" | "scanning" | "done" | "error";

export function UploadScanCard() {
  const { append_scan, users } = use_app_state();
  const [state, set_state] = useState<UploadState>("idle");
  const [files, set_files] = useState<File[]>([]);
  const [progress, set_progress] = useState(0);
  const [current_file, set_current_file] = useState<string | null>(null);
  const [findings_count, set_findings_count] = useState<number | null>(null);
  const [error, set_error] = useState<string | null>(null);
  const [assign_to, set_assign_to] = useState<string>("");
  const input_ref = useRef<HTMLInputElement>(null);
  const drop_ref = useRef<HTMLDivElement>(null);
  const poll_ref = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop_poll = useCallback(() => {
    if (poll_ref.current) { clearInterval(poll_ref.current); poll_ref.current = null; }
  }, []);

  const handle_files = useCallback((new_files: FileList | File[]) => {
    const valid = Array.from(new_files).filter(f =>
      f.name.toLowerCase().endsWith(".pdf") || f.name.toLowerCase().endsWith(".docx")
    );
    if (valid.length === 0) { set_error("Only PDF and Word (.docx) files are supported."); return; }
    set_error(null);
    set_files(prev => {
      const names = new Set(prev.map(f => f.name));
      return [...prev, ...valid.filter(f => !names.has(f.name))];
    });
  }, []);

  const handle_drop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handle_files(e.dataTransfer.files);
  }, [handle_files]);

  const remove_file = (name: string) => set_files(prev => prev.filter(f => f.name !== name));

  const start_upload = useCallback(async () => {
    if (files.length === 0) return;
    set_state("uploading");
    set_error(null);
    set_progress(0);

    const form = new FormData();
    files.forEach(f => form.append("files", f, f.name));

    const url = assign_to
      ? `${API_BASE_URL}/upload/scan?assign_to_user_id=${assign_to}`
      : `${API_BASE_URL}/upload/scan`;

    let result: any;
    try {
      const resp = await fetch(url, { method: "POST", body: form });
      result = await resp.json();
    } catch {
      set_state("error");
      set_error("Upload failed — is the backend running?");
      return;
    }

    if (result.error) { set_state("error"); set_error(result.error); return; }

    set_state("scanning");
    const { scan_id } = result;

    poll_ref.current = setInterval(async () => {
      const scan = await get_scan(scan_id);
      if (!scan) return;
      const s = scan as any;
      if (s.status === "running") {
        if (s.progress) {
          set_progress(s.progress.percent ?? 0);
          set_current_file(s.progress.current_file ?? null);
        }
        return;
      }
      stop_poll();
      set_progress(100);
      set_current_file(null);
      set_findings_count(s.files_with_findings ?? 0);
      set_state("done");
      append_scan(scan as any);
    }, 500);
  }, [files, assign_to, append_scan, stop_poll]);

  const reset = () => {
    stop_poll();
    set_state("idle");
    set_files([]);
    set_progress(0);
    set_current_file(null);
    set_findings_count(null);
    set_error(null);
  };

  const assigned_user = users.find(u => u.id === assign_to);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileUp className="h-4 w-4 text-bosch_blue" />
          Upload & scan
        </CardTitle>
        <p className="text-xs text-text_medium">
          Drop PDF or Word files to scan for personal data. Assign findings to a user so they appear in their review queue.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">

        {/* Drop zone */}
        {(state === "idle" || state === "error") && (
          <div
            ref={drop_ref}
            onDrop={handle_drop}
            onDragOver={e => e.preventDefault()}
            onClick={() => input_ref.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border_grey py-8 text-center transition-colors hover:border-bosch_blue/50 hover:bg-bosch_blue/5"
          >
            <Upload className="mb-2 h-8 w-8 text-text_medium" />
            <p className="text-sm font-medium text-text_dark">Drop PDFs or Word docs here or click to browse</p>
            <p className="mt-1 text-xs text-text_medium">Supports .pdf and .docx · multiple files at once</p>
            <input ref={input_ref} type="file" accept=".pdf,.docx" multiple className="hidden"
              onChange={e => e.target.files && handle_files(e.target.files)} />
          </div>
        )}

        {/* File list */}
        {files.length > 0 && state === "idle" && (
          <div className="space-y-1">
            {files.map(f => (
              <div key={f.name} className="flex items-center justify-between rounded-md border border-border_grey px-2.5 py-1.5">
                <span className="min-w-0 truncate font-mono text-[12px] text-text_dark">{f.name}</span>
                <span className="ml-2 shrink-0 text-xs text-text_medium">{(f.size / 1024).toFixed(0)} KB</span>
                <button onClick={() => remove_file(f.name)} className="ml-2 shrink-0 text-text_medium hover:text-bosch_red">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Assign to user picker */}
        {files.length > 0 && state === "idle" && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-text_medium">
              Assign findings to
            </label>
            <Select value={assign_to} onChange={e => set_assign_to(e.target.value)}>
              <SelectItem value="">— No assignment (catch-all MoD) —</SelectItem>
              {users.map(u => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name} ({u.role === "admin" ? "Admin" : "Employee"})
                </SelectItem>
              ))}
            </Select>
            {assign_to && (
              <p className="text-xs text-text_medium">
                Findings will appear in <span className="font-medium text-text_dark">{assigned_user?.name}</span>'s review queue after scanning.
              </p>
            )}
          </div>
        )}

        {/* Scan button */}
        {files.length > 0 && state === "idle" && (
          <button
            onClick={start_upload}
            className="w-full rounded-lg bg-bosch_red py-2 text-sm font-medium text-white transition-colors hover:bg-bosch_red/90"
          >
            Scan {files.length} file{files.length > 1 ? "s" : ""}
            {assign_to ? ` → ${assigned_user?.name}` : ""}
          </button>
        )}

        {/* Uploading */}
        {state === "uploading" && (
          <div className="flex items-center gap-2 text-sm text-text_medium">
            <Loader2 className="h-4 w-4 animate-spin text-bosch_blue" />
            Uploading files...
          </div>
        )}

        {/* Scanning progress */}
        {state === "scanning" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-bosch_blue">Scanning for personal data...</span>
              <span className="font-mono text-xs text-text_medium">{progress}%</span>
            </div>
            <Progress value={progress} />
            {current_file && (
              <p className="truncate font-mono text-xs text-text_medium">Processing: {current_file}</p>
            )}
          </div>
        )}

        {/* Done */}
        {state === "done" && (
          <div className="space-y-3">
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2.5 dark:border-emerald-500/40 dark:bg-emerald-500/10">
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                Scan complete — {findings_count} file{findings_count !== 1 ? "s" : ""} with findings
              </p>
              <p className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-400">
                {assign_to
                  ? `Findings assigned to ${assigned_user?.name}. Log in as them to review.`
                  : "Results visible in the admin dashboard."}
              </p>
            </div>
            <button
              onClick={reset}
              className="w-full rounded-lg border border-border_grey py-2 text-sm font-medium text-text_dark transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Upload more files
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="rounded-md border border-red-300 bg-red-50 px-2.5 py-2 text-xs text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
