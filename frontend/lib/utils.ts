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
