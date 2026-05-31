export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function format_document_type(value: string): string {
  return value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function format_review_status(value: string): string {
  if (value === "pending") {
    return "Pending review";
  }

  if (value === "confirmed_business_need" || value === "kept_business_need") {
    return "Business need";
  }

  if (value === "acknowledged_cleanup") {
    return "Cleanup noted";
  }

  if (value === "marked_false_positive") {
    return "False positive";
  }

  if (value === "deleted") {
    return "Deleted";
  }

  return value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function format_number(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function format_bytes_to_gb(value: number): string {
  const gb = value / 1024 / 1024 / 1024;
  return `${gb.toFixed(1)} GB`;
}

export function format_bytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function format_timestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC"
  }) + " UTC";
}

export function format_timestamp_short(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff_ms = now.getTime() - date.getTime();
  const diff_mins = Math.floor(diff_ms / 60000);
  const diff_hours = Math.floor(diff_ms / 3600000);
  const diff_days = Math.floor(diff_ms / 86400000);
  if (diff_mins < 1) return "just now";
  if (diff_mins < 60) return `${diff_mins}m ago`;
  if (diff_hours < 24) return `${diff_hours}h ago`;
  if (diff_days < 7) return `${diff_days}d ago`;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}
