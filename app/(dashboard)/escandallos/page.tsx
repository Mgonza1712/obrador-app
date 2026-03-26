import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import AssemblyList from "@/components/escandallos/AssemblyList";
import type { AssemblyWithFinancials } from "@/lib/types/escandallo.types";

export default async function EscandallosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/escandallos");

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .single();

  if (!profile?.tenant_id) redirect("/login");

  const { data: assemblies } = await supabase
    .from("assemblies_with_financials")
    .select("*")
    .eq("tenant_id", profile.tenant_id)
    .order("title");

  const rows = (assemblies ?? []) as AssemblyWithFinancials[];
  const totalAlerts = rows.reduce(
    (acc, a) => acc + (a.unread_alerts_count ?? 0),
    0
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Escandallos</h1>
          <p className="text-sm text-muted-foreground">
            Costes y márgenes de rentabilidad de tus platos
          </p>
        </div>
        <div className="flex items-center gap-3">
          {totalAlerts > 0 && (
            <Link href="/alertas-rentabilidad">
              <Button variant="outline" size="sm" className="gap-2">
                <Bell className="h-4 w-4" />
                <Badge variant="destructive" className="px-1.5 py-0 text-xs">
                  {totalAlerts}
                </Badge>
                Alertas
              </Button>
            </Link>
          )}
          <Link href="/escandallos/new">
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Nuevo Escandallo
            </Button>
          </Link>
        </div>
      </div>

      <AssemblyList assemblies={rows} />
    </div>
  );
}
