import Link from "next/link";
import { ChevronRight } from "lucide-react";
import AssemblyForm from "@/components/escandallos/AssemblyForm";

export default function NewEscandalloPage() {
  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">Inicio</Link>
        <ChevronRight className="h-4 w-4" />
        <Link href="/escandallos" className="hover:text-foreground">Escandallos</Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground">Nuevo</span>
      </nav>

      <div>
        <h1 className="text-2xl font-bold">Nuevo Escandallo</h1>
        <p className="text-sm text-muted-foreground">
          Define el coste y margen de un nuevo plato
        </p>
      </div>

      <AssemblyForm />
    </div>
  );
}
