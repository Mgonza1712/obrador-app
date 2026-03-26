import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import AssemblyForm from "@/components/escandallos/AssemblyForm";
import BomLineEditor from "@/components/escandallos/BomLineEditor";
import MarginBadge from "@/components/escandallos/MarginBadge";
import { getIngredientOptions } from "@/lib/queries/escandallo.queries";
import type {
  AssemblyWithFinancials,
  BomLineExpanded,
  MarginStatus,
} from "@/lib/types/escandallo.types";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EscandalloDetailPage({ params }: Props) {
  const { id } = await params;
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

  const [assemblyResult, bomResult, ingredientOptions] = await Promise.all([
    supabase
      .from("assemblies_with_financials")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", profile.tenant_id)
      .single(),
    supabase
      .from("bom_lines_expanded")
      .select("*")
      .eq("assembly_id", id)
      .order("sort_order"),
    getIngredientOptions(supabase, profile.tenant_id),
  ]);

  if (!assemblyResult.data) notFound();

  const a = assemblyResult.data as AssemblyWithFinancials;
  const lines = (bomResult.data ?? []) as BomLineExpanded[];
  // Exclude the assembly itself from sub-recipe options
  const options = ingredientOptions.filter(
    (o) => !(o.type === "sub_assembly" && o.id === id)
  );

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          Inicio
        </Link>
        <ChevronRight className="h-4 w-4" />
        <Link href="/escandallos" className="hover:text-foreground">
          Escandallos
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground">{a.title}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{a.title}</h1>
            {!a.is_active && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                Archivado
              </span>
            )}
          </div>
          {a.category && (
            <p className="text-sm text-muted-foreground">{a.category}</p>
          )}
        </div>
        <MarginBadge
          margin_status={(a.margin_status as MarginStatus) ?? "no_price"}
          margin_pct={a.margin_pct}
        />
      </div>

      {/* Financial summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Coste (COGS)</p>
          <p className="text-xl font-bold">
            {a.cogs != null ? `${a.cogs.toFixed(2)} €` : "—"}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">P.V.P.</p>
          <p className="text-xl font-bold">
            {a.sale_price != null && a.sale_price > 0
              ? `${a.sale_price.toFixed(2)} €`
              : "Sin P.V.P."}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Margen</p>
          <p className="text-xl font-bold">
            {a.margin_pct != null && a.sale_price
              ? `${a.margin_pct.toFixed(1)}%`
              : "—"}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Ingredientes</p>
          <p className="text-xl font-bold">{a.ingredient_count ?? 0}</p>
        </div>
      </div>

      {/* SECCIÓN 1: Composición del plato */}
      <Card>
        <CardHeader>
          <CardTitle>Composición del Plato</CardTitle>
          <CardDescription>
            Ingredientes y sub-recetas que forman este escandallo. El coste
            total se recalcula automáticamente al guardar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BomLineEditor
            assemblyId={id}
            initialLines={lines}
            ingredientOptions={options}
          />
        </CardContent>
      </Card>

      <Separator />

      {/* SECCIÓN 2: Datos financieros */}
      <Card>
        <CardHeader>
          <CardTitle>Datos del Escandallo</CardTitle>
          <CardDescription>
            Precio de venta, margen objetivo y configuración de costes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AssemblyForm assembly={a} />
        </CardContent>
      </Card>
    </div>
  );
}
