import Link from "next/link";
import { Bell } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import MarginBadge from "./MarginBadge";
import type { AssemblyWithFinancials, MarginStatus } from "@/lib/types/escandallo.types";

interface Props {
  assembly: AssemblyWithFinancials;
}

export default function AssemblyCard({ assembly: a }: Props) {
  return (
    <Link href={`/escandallos/${a.id}`}>
      <Card
        className={`transition-shadow hover:shadow-md ${
          !a.is_active ? "opacity-60" : ""
        }`}
      >
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base leading-snug">{a.title}</CardTitle>
            <MarginBadge
              margin_status={(a.margin_status as MarginStatus) ?? "no_price"}
              margin_pct={a.margin_pct}
            />
          </div>
          {a.category && (
            <p className="text-xs text-muted-foreground">{a.category}</p>
          )}
          {!a.is_active && (
            <Badge variant="secondary" className="w-fit text-xs">
              Archivado
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Coste</p>
              <p className="font-semibold tabular-nums">
                {a.cogs != null ? `${a.cogs.toFixed(2)} €` : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">P.V.P.</p>
              <p className="font-semibold tabular-nums">
                {a.sale_price != null && a.sale_price > 0
                  ? `${a.sale_price.toFixed(2)} €`
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Ingredientes</p>
              <p className="font-semibold">{a.ingredient_count ?? 0}</p>
            </div>
          </div>

          {(a.unread_alerts_count ?? 0) > 0 && (
            <div className="mt-2 flex items-center gap-1 text-xs text-orange-600">
              <Bell className="h-3 w-3" />
              {a.unread_alerts_count} alerta
              {a.unread_alerts_count !== 1 ? "s" : ""} sin leer
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
