"use client";

import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function RunScanDialog({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();

  const open_scan_page = () => {
    onOpenChange(false);
    router.push("/run-scan");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run new scan</DialogTitle>
          <DialogDescription>
            Start a full or delta mock scan from the run scan page. Human review remains required for all
            findings.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={open_scan_page}>Open run scan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
