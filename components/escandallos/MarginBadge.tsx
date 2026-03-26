import { cn } from "@/lib/utils";
import type { MarginStatus } from "@/lib/types/escandallo.types";

interface Props {
  margin_status: MarginStatus;
  margin_pct: number | null;
  className?: string;
}

const config: Record<
  MarginStatus,
  { label: string; dot: string; badge: string }
> = {
  healthy: {
    label: "Saludable",
    dot: "bg-green-500",
    badge: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  warning: {
    label: "Alerta",
    dot: "bg-yellow-500",
    badge: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  critical: {
    label: "Crítico",
    dot: "bg-red-500",
    badge: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  },
  no_price: {
    label: "Sin P.V.P.",
    dot: "bg-gray-400",
    badge: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  },
};

export default function MarginBadge({ margin_status, margin_pct, className }: Props) {
  const { label, dot, badge } = config[margin_status] ?? config.no_price;
  const showPct = margin_pct != null && margin_status !== "no_price";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        badge,
        className
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", dot)} />
      {showPct ? `${margin_pct!.toFixed(1)}%` : label}
    </span>
  );
}
