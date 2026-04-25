# Decisiones: Rediseno Modulo de Compras + Roadmap de Valor

**Fecha:** 2026-04-23
**Estado:** Decisiones cerradas. Planificacion de fases pendiente.
**Participantes:** Maxi (founder), Claude Code (planificacion)

---

## Contexto

El documento `docs/changes/modulo-compras.md` planteo un replanteo completo del proceso de compras. Se analizaron roles, recepcion, precios, tickets, extraccion, documentos por multiples canales, revision, bot WPP y dashboard. Se identificaron 40 decisiones + 5 gaps + analisis competitivo.

---

## 1. Decisiones de Arquitectura

### 1.1 Roles y Permisos

- **Modelo:** Tabla intermedia `user_venue_sectors(user_id, venue_id, sector)`. Un usuario puede operar en distintos sectores por local.
- **Roles:** `buyer`, `shift_manager` (solo lectura), `local_admin`, `admin`, `owner`.
- **Funciones de buyer incluyen escandallos** (crear recetas, ver costes) — el jefe de cocina/barra arma los platos, no administracion.
- **Owner = local_admin + gestion usuarios + config integraciones + bot WPP.**
- **Permisos extra** asignables desde la app (array `extra_permissions` en profiles). Fase 2.
- **Implementacion pragmatica:** verificacion por rol en cada pagina/action, no sistema granular de permisos en BD.

### 1.2 Aprobacion de Pedidos

- Auto-aprobacion por defecto (configurable por sector).
- Cuando se active: el encargado de local o admin aprueba antes de enviar.

---

## 2. Proceso de Compras — Ciclo Completo

### 2.1 Pedido

- Creacion desde app (`/pedidos/new`) o via bot WPP (responde con link).
- Lineas vinculadas a master items + proveedor preferido.
- Estados: `draft` → `approved` → `sent` → `partially_delivered` → `delivered` → `invoiced`.
- Pedidos sin envio (tipo lista para Makro): `source_channel = 'internal'`.

### 2.2 Recepcion

- **QR permanente por local** en la puerta del almacen → `pizca.app/recepcion/{venue_token}`.
- Muestra pedidos pendientes de entrega del local (todos los sectores, agrupados por proveedor) + boton scanner para documentos sin pedido.
- **Pantalla de recepcion:** vista informativa del pedido (referencia de lo que se pidio) + foto del albaran + campo de observaciones. **El control fisico se hace con el papel del albaran (tradicional).** El celular no reemplaza al albaran para el conteo.
- Caso sin albaran papel: se habilitan campos de cantidad recibida.
- **Discrepancias:** comparacion automatica pedido vs albaran extraido (datos estructurados). Las observaciones del receptor son contexto adicional, no fuente de datos para la comparacion.
- **Entregas parciales:** pedido queda en `partially_delivered`. Notificacion al comprador si quedan lineas sin entregar tras N dias. Cancelacion manual por el comprador.

### 2.3 Reclamos

- Discrepancia detectada → notificacion interna al comprador.
- Comprador decide si reclamar → mensaje automatico al proveedor (WPP ordering / email).
- Follow-up automatico si no hay respuesta en 48h.

### 2.4 Factura y Conciliacion

- Conciliacion en cascada: 1) match por document_number, 2) fallback proveedor+fecha+importe, 3) manual.
- Albaran+factura juntos (pago efectivo): escanear solo la factura.

---

## 3. Precios

### 3.1 Nuevo status `agreed`

- Presupuesto activado → `price_history status='agreed'` (persiste).
- Factura llega → nuevo `price_history status='active'`.
- El `agreed` NO se archiva al llegar facturas.
- Comparacion: `active` vs `agreed` → alerta si te cobran mas de lo pactado.
- Precios pactados editables manualmente desde `/catalogo`.

### 3.2 Comparacion de presupuestos

- Comparar `quote` vs `active + is_preferred` (no solo active).
- Modulo de comparacion existente se adapta a este flujo.

### 3.3 Descuentos promocionales (tickets)

- Precio CON descuento se guarda como `active`.
- Metadata: `is_promotional: true`, `list_price` en `ai_interpretation`.
- Si la proxima compra es sin promo, la diferencia se detecta como subida.

### 3.4 IVA en tickets

- Precios del ticket vienen CON IVA.
- Para lineas que van a catalogo: calcular precio SIN IVA usando letra del ticket o tabla de IVAs por categoria del mercado espanol como fallback.
- Para gastos varios: se guarda con IVA incluido (flag `includes_iva: true`).

---

## 4. Extraccion y Escalabilidad

### 4.1 Hint del pedido

- Cuando hay pedido pendiente del mismo proveedor, las lineas del pedido se incluyen en el prompt del LLM como contexto.
- Mejora accuracy significativamente (scope de busqueda mas estrecho).

### 4.2 Catalogo global cross-tenant

- Tabla `global_provider_products`: `provider_tax_id/name_norm` + `raw_name` + formato completo.
- Alimentada por confirmaciones humanas de cualquier tenant.
- **Auto-approve:** si match en catalogo global + confidence precio alta → crear master_item + alias automaticamente en el tenant → no va a revision.
- Reduce friccion de onboarding de nuevos clientes con proveedores conocidos.

### 4.3 Tabla de IVAs por categoria

- Referencia para mercado espanol (4%, 10%, 21% por tipo de producto).
- Fallback cuando el LLM no puede extraer el IVA por linea.

---

## 5. Tickets de Supermercado

- **Modo parcial:** LLM extrae todas las lineas. Paso intermedio con pre-seleccion inteligente (match existente = seleccionado, resto deseleccionado).
- **Gastos varios:** suma de lineas no seleccionadas (con IVA). Se registra como una sola linea sin master_item.
- **Tipo de documento:** el usuario lo elige al escanear (hint para el extractor). Opcion "No se" para inferencia automatica.
- **Async:** escanea multiples tickets → se va → notificacion cuando listo → seleccion despues.
- **Descuentos (PROMO LIDL PLUS):** LLM asocia linea de descuento al producto anterior. Precio final con descuento se guarda como active.

---

## 6. Documentos por Multiples Canales

### 6.1 Matching con pedidos

- Score automatico por proveedor + productos + fechas.
- Relacion N:M via tabla `erp_order_documents`.

### 6.2 Duplicados

- Check por `document_number + provider_id + fecha`.
- Si duplicado: guardar PDF como version mejorada, no reprocesar. Badge "Version PDF disponible" en revision.

### 6.3 Canales

- **Email:** extractor procesa, match pedido, check duplicado.
- **WPP:** PDF → procesa y responde resumen + link. Foto → link al scanner (calidad).
- **Carga manual:** boton en `/documentos` con selector proveedor+tipo como hint.
- **Scan sin pedido:** sistema busca pedidos pendientes del proveedor en background igualmente.

---

## 7. Revision de Documentos

- **Todo va a revision admin** (como hoy).
- **Opcion de asignar revisor:** `assigned_reviewer_id` en `erp_documents`. Un click a nivel documento.
- Notificacion al asignado. Vista filtrada "Mis documentos asignados".

---

## 8. Bot WPP

- **Hub de notificaciones + consultas** (no transaccional para operaciones).
- Fotos → link scanner. PDFs → procesa y link. Pedidos → link `/pedidos/new`.
- **Consultas via Text-to-SQL** (decision 2026-04-24): GPT-4o-mini genera SQL contra el schema real. No vistas hardcodeadas.
  - Endpoint: `POST /bot/query` en pizca-extractor
  - System prompt con schema + few-shot examples
  - Rol Postgres read-only con RLS + timeout 5s + LIMIT 100
  - Maneja preguntas imprevistas (no limitado a queries predefinidos)
  - Sin LangChain/LlamaIndex/RAG — API nativa de OpenAI con text-to-sql directo
  - GPT-4o-mini para consultas (barato), GPT-4o solo para extractor (vision + razonamiento complejo)

---

## 9. Dashboard

- **Home dinamica por rol.**
- Buyer: sus pedidos, pendientes de entrega, alerta stock.
- Admin: docs en revision, precios que subieron, KPIs.
- Owner: puede cambiar entre vistas + metricas de negocio.

---

## 10. Gaps Identificados

1. **Devoluciones/notas de credito:** `doc_type = 'Nota de Credito'`, lineas negativas, vinculacion al albaran original.
2. **Correccion errores post-aprobacion:** editar formato en `/catalogo/[id]` → recalcular costes en price_history → alerta en escandallos.
3. **Cancelacion/modificacion pedido enviado:** status `amended`, mensaje de actualizacion al proveedor.
4. **Vigencia de precios pactados:** campo `valid_until` en price_history para agreed. Alerta "EXPIRADO" en comparaciones.
5. **Flujos nuevos de datos:** global_provider_products, erp_order_documents, vistas para bot.

---

## 11. Roadmap de Valor y Diferenciacion Competitiva

### 11.1 Competidores principales

| Competidor | Pais | Foco | Precio estimado |
|------------|------|------|-----------------|
| **Apicbase** | Belgica | F&B completo (recetas, inventory, purchasing, menu engineering) | 300-400 EUR/local/mes |
| **MarketMan** | Israel/US | Purchasing, inventory, OCR basico | 150-300 USD/local/mes |
| **Nilus** | Espana/LatAm | Demand forecasting + waste reduction con ML | — |
| **Supy** | Dubai | Inventory + purchasing mid-market | 100-200 USD/local/mes |
| **Prezo** | Espana | Menu engineering y pricing optimization | — |
| **Mapal** | Espana | Workforce management, expandiendo operaciones | — |
| **Galdon Software** | Espana | ERP tradicional hosteleria, legacy UX | — |

### 11.2 Diferenciadores de Pizca (ya construidos o en construccion)

1. **Extraccion con LLM (GPT-4o)** vs OCR basico — mayor accuracy en documentos espanoles desordenados.
2. **WhatsApp/Telegram nativo** — proveedores se comunican donde ya estan, no en un portal.
3. **Price intelligence con confidence scoring** — ningun competidor tiene scoring probabilistico de confianza en precios extraidos.
4. **Catalogo global cross-tenant** — cada cliente nuevo reduce la friccion del siguiente. Efecto de red.
5. **Foco en mercado espanol** — compliance fiscal, IVA, proveedores locales, idioma.
6. **Automatizacion de reclamos y conciliacion** — de principio a fin, no solo deteccion.

### 11.3 Features de alto valor por implementar

#### INMEDIATO (sale del modulo de compras)

- **Scoring de cumplimiento de proveedores** — entregas a tiempo, pedidos completos, discrepancias de precio, productos devueltos. Score 1-10 por proveedor. Sale directamente de los datos de pedidos+recepciones+discrepancias.

#### MEDIO PLAZO (requiere integracion TPV)

- **Integracion con TPV** (Revo XEF, Last.app, Agora) — LA pieza que falta. Desbloquea 5 features de golpe.
  - TPV envia: platos vendidos, cantidades, timestamps, PVP, descuentos, metodo pago.
  
- **P&L Dashboard real** — Ingresos (TPV) vs Egresos (facturas). Food cost % real (no teorico). Por local, por periodo, por categoria.

- **Reporte mensual IA con contexto local** — GPT-4o analiza datos del mes + contexto (clima, eventos, economia de la zona, datos anonimizados de otros clientes de la zona) y genera recomendaciones accionables:
  - "El precio de la ternera subio 12%, los restaurantes de tu zona ya ajustaron PVP"
  - "Tu food cost es 29%, la media de tu zona es 31%, lo estas haciendo bien"
  - "Las ventas de ensaladas suben en mayo en Malaga, considera menu ligero"

- **Consumo teorico vs real** — Ventas (TPV) × receta (escandallo) = consumo teorico. Compras - stock = consumo real. Diferencia = merma/robo/porciones grandes.

#### FUTURO (requiere datos acumulados)

- **Pedido automatico por par levels** — Stock estimado baja de minimo → genera pedido borrador automaticamente.
- **Demand forecasting** — ML sobre historial de ventas + dia + clima + eventos. "Para el viernes se estima vender 80 hamburguesas, pedi 30% mas de carne."
- **Menu engineering (matriz Boston)** — Stars/Cash cows/Puzzles/Dogs basado en rentabilidad + ventas.

### 11.4 Propuesta de valor para pagina web de ventas

**AUTOMATIZACION EN COMPRAS:**
- "Tu equipo pide por WhatsApp, Pizca arma el pedido automaticamente"
- "Pizca envia el pedido al proveedor por el canal que prefiera"
- "Si falta algo en la entrega, Pizca lo detecta y te avisa"
- "Si te cobran mas de lo pactado, Pizca te alerta"
- "Si el reclamo es valido, Pizca envia el mensaje al proveedor por vos"

**AUTOMATIZACION EN CONTROL:**
- "Pizca lee tus facturas y albaranes automaticamente — sin tipear nada"
- "Pizca concilia facturas con albaranes y te avisa si hay diferencias"
- "Pizca detecta subidas de precio y te dice quien te esta cobrando de mas"
- "Pizca compara presupuestos y te recomienda el proveedor mas barato"

**AUTOMATIZACION EN COSTES:**
- "Pizca actualiza el coste de tus platos en tiempo real"
- "Si el margen de un plato baja del target, te avisa"
- "Pizca te dice que platos reformular o eliminar del menu"

**FUTURO (con TPV):**
- "Pizca te dice tu food cost real, no el teorico"
- "Pizca detecta merma y consumo anormal"
- "Pizca predice cuanto vas a vender y te sugiere cuanto pedir"
- "Pizca te envia un reporte mensual con recomendaciones personalizadas para tu zona"

**EFECTO DE RED (unico en el mercado):**
- "Cada cliente nuevo hace que Pizca sea mas inteligente para todos. El catalogo de productos crece, los formatos se verifican automaticamente, y los tiempos de alta se reducen."
