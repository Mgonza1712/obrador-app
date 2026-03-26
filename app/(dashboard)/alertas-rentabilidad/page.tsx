import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import CostAlertsFeed from "@/components/escandallos/CostAlertsFeed";
import type { CostAlertWithAssembly } from "@/lib/types/escandallo.types";

export default async function AlertasRentabilidadPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/alertas-rentabilidad");

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .single();
  if (!profile?.tenant_id) redirect("/login");

  // Fetch last 50 alerts, unread first
  const { data: alerts } = await supabase
    .from("cost_alerts")
    .select("*")
    .eq("tenant_id", profile.tenant_id)
    .order("is_read", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(50);

  // Fetch assembly titles for alerts that have an assembly_id
  const assemblyIds = [
    ...new Set(
      (alerts ?? [])
        .map((a) => a.assembly_id)
        .filter(Boolean) as string[]
    ),
  ];

  let assemblyTitles: Record<string, string> = {};
  if (assemblyIds.length > 0) {
    const { data: assemblies } = await supabase
      .from("assemblies")
      .select("id, title")
      .in("id", assemblyIds);
    assemblyTitles = Object.fromEntries(
      (assemblies ?? []).map((a) => [a.id, a.title])
    );
  }

  const alertsWithTitles: CostAlertWithAssembly[] = (alerts ?? []).map((a) => ({
    ...a,
    assembly_title: a.assembly_id ? assemblyTitles[a.assembly_id] ?? null : null,
  }));

  const unreadCount = alertsWithTitles.filter((a) => !a.is_read).length;

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">Inicio</Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground">Alertas de Rentabilidad</span>
      </nav>

      <div>
        <h1 className="text-2xl font-bold">Alertas de Rentabilidad</h1>
        <p className="text-sm text-muted-foreground">
          {unreadCount > 0
            ? `${unreadCount} alertas sin leer`
            : "Todas las alertas leídas"}
        </p>
      </div>

      <CostAlertsFeed
        initialAlerts={alertsWithTitles}
        tenantId={profile.tenant_id}
      />
    </div>
  );
}
