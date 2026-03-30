"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import MarginBadge from "./MarginBadge";
import type { AssemblyWithFinancials, MarginStatus } from "@/lib/types/escandallo.types";

interface Props {
  assemblies: AssemblyWithFinancials[];
}

type FilterTab = "all" | MarginStatus;

const tabs: { value: FilterTab; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "healthy", label: "Saludable" },
  { value: "warning", label: "Alerta" },
  { value: "critical", label: "Crítico" },
];

function MarginBadgeWithTooltip({ assembly: a }: { assembly: AssemblyWithFinancials }) {
  const getTooltipText = () => {
    if (a.margin_status === "no_price") {
      return "Sin precio de venta configurado. Asigna un P.V.P. para calcular el margen.";
    }
    if (a.margin_status === "healthy") {
      return `Margen saludable: ${a.margin_pct}% ≥ objetivo ${a.margin_target_pct}%`;
    }
    if (a.margin_status === "warning") {
      return `Margen en alerta: ${a.margin_pct}% está a menos de 10 puntos del objetivo (${a.margin_target_pct}%)`;
    }
    return `Margen crítico: ${a.margin_pct}% está por debajo del objetivo (${a.margin_target_pct}%). Revisa los costes o el precio de venta.`;
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <MarginBadge
            margin_status={(a.margin_status as MarginStatus) ?? "no_price"}
            margin_pct={a.margin_pct}
          />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-sm">
        <p>{getTooltipText()}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export default function AssemblyList({ assemblies }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<FilterTab>("all");

  const filtered = assemblies.filter((a) => {
    const matchesSearch =
      search === "" ||
      a.title?.toLowerCase().includes(search.toLowerCase()) ||
      a.category?.toLowerCase().includes(search.toLowerCase());

    const matchesTab =
      tab === "all" ||
      (tab === "no_price"
        ? a.margin_status === "no_price"
        : a.margin_status === tab);

    return matchesSearch && matchesTab;
  });

  if (assemblies.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <p className="text-muted-foreground">Aún no hay escandallos creados.</p>
        <p className="text-sm text-muted-foreground mt-1">
          Crea tu primer escandallo con el botón &quot;Nuevo Escandallo&quot;.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={(v) => setTab(v as FilterTab)}>
          <TabsList>
            {tabs.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Input
          placeholder="Buscar escandallo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </div>

      <div className="rounded-lg border">
        <div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">Nombre</th>
                <th className="px-4 py-3 text-left font-medium">Categoría</th>
                <th className="px-4 py-3 text-right font-medium">Coste</th>
                <th className="px-4 py-3 text-right font-medium">P.V.P.</th>
                <th className="px-4 py-3 text-right font-medium">Margen %</th>
                <th className="px-4 py-3 text-center font-medium">Estado</th>
                <th className="px-4 py-3 text-center font-medium">Alertas</th>
                <th className="px-4 py-3 text-left font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    Sin resultados para esta búsqueda.
                  </td>
                </tr>
              ) : (
                filtered.map((a) => (
                  <tr
                    key={a.id}
                    onClick={() => router.push(`/escandallos/${a.id}`)}
                    className={`cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/30 ${
                      !a.is_active ? "opacity-50" : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-medium">
                      <div className="flex items-center gap-2">
                        {a.title}
                        {!a.is_active && (
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            Archivado
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {a.category ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {a.cogs != null ? `${a.cogs.toFixed(2)} €` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {a.sale_price != null && a.sale_price > 0
                        ? `${a.sale_price.toFixed(2)} €`
                        : <span className="text-muted-foreground">Sin P.V.P.</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {a.margin_pct != null && a.sale_price
                        ? `${a.margin_pct.toFixed(1)}%`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <MarginBadgeWithTooltip assembly={a} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      {(a.unread_alerts_count ?? 0) > 0 ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            router.push('/alertas-rentabilidad')
                          }}
                          className="cursor-pointer"
                        >
                          <Badge
                            variant="destructive"
                            className="gap-1 px-1.5"
                          >
                            <Bell className="h-3 w-3" />
                            {a.unread_alerts_count}
                          </Badge>
                        </button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/escandallos/${a.id}`);
                        }}
                        className="text-xs text-primary underline-offset-4 hover:underline"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
