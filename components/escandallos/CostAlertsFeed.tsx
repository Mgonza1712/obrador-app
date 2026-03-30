"use client";

import { useState, useTransition, useEffect } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { markAlertAsRead, markAllAlertsAsRead } from "@/lib/actions/escandallo.actions";
import { createClient } from "@/lib/supabase/client";
import type { CostAlertWithAssembly, AlertType } from "@/lib/types/escandallo.types";

const ALERT_CONFIG: Record<
  AlertType,
  { emoji: string; label: string; badgeClass: string }
> = {
  ingredient_price_spike: {
    emoji: "🔴",
    label: "Subida de precio de ingrediente",
    badgeClass:
      "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  },
  cogs_increased: {
    emoji: "🟠",
    label: "Coste del plato aumentó",
    badgeClass:
      "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  },
  margin_below_target: {
    emoji: "🟡",
    label: "Margen por debajo del objetivo",
    badgeClass:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateStr));
}

interface Props {
  initialAlerts: CostAlertWithAssembly[];
  tenantId: string;
}

export default function CostAlertsFeed({ initialAlerts, tenantId }: Props) {
  const [alerts, setAlerts] = useState<CostAlertWithAssembly[]>(initialAlerts);
  const [isPending, startTransition] = useTransition();
  // showReadAlerts[type] = true means the read alerts for that group are expanded
  const [showReadAlerts, setShowReadAlerts] = useState<Record<string, boolean>>({});

  // Supabase Realtime subscription
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("cost_alerts_feed")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "cost_alerts",
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          const newAlert = payload.new as CostAlertWithAssembly;
          setAlerts((prev) => [newAlert, ...prev]);
          toast("Nueva alerta de rentabilidad", {
            description: newAlert.message ?? undefined,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId]);

  function handleMarkRead(id: string) {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, is_read: true } : a))
    );
    startTransition(async () => {
      const result = await markAlertAsRead(id);
      if (!result.success) {
        setAlerts((prev) =>
          prev.map((a) => (a.id === id ? { ...a, is_read: false } : a))
        );
        toast.error(result.error);
      }
    });
  }

  function handleMarkAllRead() {
    setAlerts((prev) => prev.map((a) => ({ ...a, is_read: true })));
    startTransition(async () => {
      const result = await markAllAlertsAsRead(tenantId);
      if (!result.success) {
        setAlerts(initialAlerts);
        toast.error(result.error);
      }
    });
  }

  function toggleReadAlerts(type: string) {
    setShowReadAlerts((prev) => ({ ...prev, [type]: !prev[type] }));
  }

  // Group by type
  const grouped: Record<string, CostAlertWithAssembly[]> = {};
  for (const alert of alerts) {
    const type = alert.alert_type as AlertType;
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(alert);
  }

  const unreadCount = alerts.filter((a) => !a.is_read).length;
  const allTypes = Object.keys(ALERT_CONFIG) as AlertType[];

  if (alerts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <p className="text-muted-foreground">No hay alertas registradas.</p>
        <p className="text-sm text-muted-foreground mt-1">
          Las alertas aparecen automáticamente cuando los costes cambian.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {unreadCount > 0 && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllRead}
            disabled={isPending}
          >
            Marcar todas como leídas ({unreadCount})
          </Button>
        </div>
      )}

      {allTypes.map((type) => {
        const group = grouped[type];
        if (!group || group.length === 0) return null;
        const config = ALERT_CONFIG[type];
        const unread = group.filter((a) => !a.is_read);
        const read = group.filter((a) => a.is_read);
        const unreadInGroup = unread.length;
        const readCount = read.length;
        const showRead = showReadAlerts[type] ?? false;

        // If the group has ONLY read alerts and is collapsed, render a compact collapsed row
        if (unreadInGroup === 0 && !showRead) {
          return (
            <div key={type}>
              <button
                className="flex w-full items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-accent/30 transition-colors"
                onClick={() => toggleReadAlerts(type)}
              >
                <ChevronRight className="h-4 w-4 shrink-0" />
                <span>{config.emoji}</span>
                <span className="font-medium">{config.label}</span>
                <span className="ml-auto text-xs">
                  {readCount} alerta{readCount !== 1 ? "s" : ""} leída{readCount !== 1 ? "s" : ""}
                </span>
                <span className="text-xs text-primary font-medium">Ver</span>
              </button>
            </div>
          );
        }

        return (
          <div key={type} className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <span>{config.emoji}</span>
              {config.label}
              {unreadInGroup > 0 && (
                <Badge variant="secondary">{unreadInGroup}</Badge>
              )}
            </h2>

            <div className="space-y-2">
              {/* Unread alerts: full card */}
              {unread.map((alert) => (
                <div
                  key={alert.id}
                  className="rounded-lg border p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 flex-1">
                      <p className="text-sm font-medium">{alert.message}</p>

                      {alert.assembly_title && (
                        <p className="text-xs text-muted-foreground">
                          Plato:{" "}
                          <span className="font-medium">
                            {alert.assembly_title}
                          </span>
                        </p>
                      )}

                      {alert.old_value != null && alert.new_value != null && (
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {alert.old_value.toFixed(3)} €{" "}
                          <span className="text-muted-foreground">→</span>{" "}
                          <span className="font-medium text-foreground">
                            {alert.new_value.toFixed(3)} €
                          </span>
                          {alert.pct_change != null && (
                            <span
                              className={`ml-2 font-semibold ${
                                alert.pct_change > 0
                                  ? "text-red-600"
                                  : "text-green-600"
                              }`}
                            >
                              {alert.pct_change > 0 ? "+" : ""}
                              {alert.pct_change.toFixed(1)}%
                            </span>
                          )}
                        </p>
                      )}

                      <p className="text-xs text-muted-foreground">
                        {formatDate(alert.created_at)}
                      </p>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-xs"
                      onClick={() => handleMarkRead(alert.id)}
                      disabled={isPending}
                    >
                      Leída
                    </Button>
                  </div>
                </div>
              ))}

              {/* Read alerts: collapsed toggle row */}
              {readCount > 0 && !showRead && (
                <button
                  className="flex w-full items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-accent/30 transition-colors"
                  onClick={() => toggleReadAlerts(type)}
                >
                  <ChevronRight className="h-4 w-4 shrink-0" />
                  <span>
                    {readCount} alerta{readCount !== 1 ? "s" : ""} leída{readCount !== 1 ? "s" : ""}
                  </span>
                  <span className="ml-auto text-xs text-primary font-medium">Ver</span>
                </button>
              )}

              {/* Read alerts: expanded compact list */}
              {showRead && read.map((alert) => (
                <div
                  key={alert.id}
                  className="rounded-lg border border-dashed px-3 py-2.5 opacity-60"
                >
                  <p className="text-sm">{alert.message}</p>
                  {alert.assembly_title && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Plato:{" "}
                      <span className="font-medium">{alert.assembly_title}</span>
                      {" · "}
                      {formatDate(alert.created_at)}
                    </p>
                  )}
                </div>
              ))}

              {/* Collapse button when read alerts are expanded */}
              {showRead && readCount > 0 && (
                <button
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => toggleReadAlerts(type)}
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                  Ocultar leídas
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
