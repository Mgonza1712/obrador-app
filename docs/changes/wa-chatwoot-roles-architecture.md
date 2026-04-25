# WA + Chatwoot + Roles — Plan de implementación

**Fecha:** 2026-04-21  
**Estado:** Diseño aprobado, implementación pendiente  
**Servicios afectados:** Supabase, obrador-app, n8n, Evolution API, Chatwoot

---

## Decisiones de arquitectura confirmadas

### Dos números WhatsApp por tenant

| Instancia | Propósito | Quién la usa |
|-----------|-----------|--------------|
| **Bot** (instancia existente) | Conversaciones con usuarios internos (dueño hoy, compradores futuro) | Usuarios de Pizca |
| **Ordering** (segunda instancia) | Envío de pedidos a proveedores + recepción de respuestas | Sistema automático + Chatwoot |

- Un solo número por tenant (Grupo 78 = un número ordering)
- Chatwoot conectado a la instancia ordering → bandeja compartida de respuestas de proveedores
- El proveedor siempre habla con "Grupo 78", nunca con personas individuales

### Roles de usuario

| Rol | Quiénes | App Pizca | Bot WA |
|-----|---------|-----------|--------|
| `buyer` | Jefe de cocina Cafeseamos, jefe de barra Biergarten, etc. | Sus pedidos (filtrado por user+local+sector), crear pedidos | — (fuera de scope MVP) |
| `local_admin` | Encargado de local | Todos los pedidos/docs de su local | — |
| `admin` | Administración (1-2 personas) | Todo, sin filtros | Consultas cross-local, métricas |
| `owner` | Dueños (2-3 personas) | Todo + editar/eliminar | Acceso completo al bot |

**MVP simplificado:** Bot WA queda solo para `owner`. Si el owner pide hacer un pedido por WA, el bot responde con el link a `/pedidos/new`. Los compradores crean pedidos exclusivamente desde la app.

### Problema JID de WhatsApp

WhatsApp devuelve dos formatos de JID:
- `34657206599@s.whatsapp.net` — contiene el número (formato legacy)
- `35343386595479@lid` — ID opaco, **no contiene el número** (formato nuevo)

**No se puede extraer el número del JID de forma confiable.** Estrategia:

#### Usuarios internos (compradores, admins, owners)
1. Admin crea perfil en Pizca, ingresa número de teléfono
2. App llama a Evolution API (instancia bot) → envía WA al número: `"Vinculá tu cuenta Pizca respondiendo: PIZCA-{code}"`
3. Usuario responde → webhook bot n8n detecta prefijo `PIZCA-` → extrae code → guarda `user_profiles.whatsapp_jid = remoteJid`
4. JID almacenado (cualquier formato) se usa para identificar al usuario en futuros mensajes

#### Proveedores
1. Cuando enviamos pedido, Evolution API crea conversación con el número del proveedor
2. Respuesta del proveedor llega en esa misma conversación → Chatwoot la gestiona
3. Primera respuesta → guardar `erp_providers.whatsapp_jid = remoteJid` automáticamente (n8n)
4. Desde entonces el JID identifica al proveedor en el bot

---

## Pasos de implementación

### Paso 1 — Migración Supabase

```sql
-- user_profiles: roles, WA linking, local/sector
ALTER TABLE user_profiles 
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'buyer'
    CHECK (role IN ('buyer','local_admin','admin','owner')),
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_jid TEXT,
  ADD COLUMN IF NOT EXISTS local_ids UUID[],
  ADD COLUMN IF NOT EXISTS sector TEXT;

-- erp_providers: JID para reconocer respuestas de proveedores
ALTER TABLE erp_providers
  ADD COLUMN IF NOT EXISTS whatsapp_jid TEXT;

-- erp_tenants: config Evolution API + Chatwoot
ALTER TABLE erp_tenants
  ADD COLUMN IF NOT EXISTS evolution_bot_instance TEXT,
  ADD COLUMN IF NOT EXISTS evolution_ordering_instance TEXT,
  ADD COLUMN IF NOT EXISTS chatwoot_inbox_id INTEGER,
  ADD COLUMN IF NOT EXISTS chatwoot_account_id INTEGER;

-- erp_purchase_orders: trazabilidad por usuario
-- (created_by ya debería existir, verificar)
ALTER TABLE erp_purchase_orders
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id);
```

**Archivo de migración:** `supabase/migrations/20260421_user_profiles_roles_wa.sql`

### Paso 2 — RLS para filtrado por rol

```sql
-- buyers solo ven sus pedidos
CREATE POLICY "buyers_own_orders" ON erp_purchase_orders
  FOR SELECT USING (
    auth.uid() IN (
      SELECT id FROM user_profiles WHERE role = 'buyer'
    ) AND created_by_user_id = auth.uid()
  );

-- local_admin ven pedidos de sus locales
-- admin y owner ven todo → sin restricción adicional
```

### Paso 3 — obrador-app: sección `/admin`

**Ruta:** `app/(dashboard)/admin/`

```
/admin
  ├─ page.tsx                  → redirect a /admin/usuarios
  ├─ layout.tsx                → tabs nav: Usuarios | WhatsApp | Configuración
  ├─ usuarios/
  │   ├─ page.tsx              → lista usuarios con rol/local/sector
  │   └─ _components/
  │       ├─ UsersTable.tsx    → tabla con acciones editar/crear
  │       └─ UserForm.tsx      → form: nombre, email, teléfono, rol, locales, sector
  └─ whatsapp/
      ├─ page.tsx              → estado + QR ordering instance
      └─ _components/
          ├─ WAStatusCard.tsx  → badge conectado/desconectado + botón reconectar
          ├─ QRDisplay.tsx     → img base64 del QR (polling cada 3s hasta conectar)
          └─ LinkUserWA.tsx    → botón "Enviar código de vinculación" por usuario
```

**Server Actions necesarios** (`app/actions/admin.ts`):
- `getWAStatus(instanceName)` → `GET evolution-api/instance/connectionState/{instance}`
- `getWAQR(instanceName)` → `GET evolution-api/instance/connect/{instance}` → `{ qrcode.base64 }`
- `sendWALinkCode(userId)` → genera código PIZCA-XXXX, lo guarda en user_profiles, envía WA via Evolution API
- `getUsers()`, `createUser()`, `updateUser()`

### Paso 4 — n8n: actualizar "Pizca - WPP Bot"

Cambios en el workflow `D5ul7ov1pTHnpQlb`:

1. **Nodo de entrada**: detectar mensajes con prefijo `PIZCA-`
   - Si match → lookup código en user_profiles → guardar JID → responder "WhatsApp vinculado ✓"
   - Si no match → continuar flujo normal

2. **Nodo lookup de usuario**: cambiar de hardcoded a:
   ```javascript
   // Buscar por JID
   const jid = $json.data.key.remoteJid
   const { data: user } = await supabase
     .from('user_profiles')
     .select('id, role, local_ids, sector')
     .eq('whatsapp_jid', jid)
     .single()
   ```

3. **Nodo classify-intent**: agregar verificación de rol antes de responder métricas:
   - Si `role = 'buyer'` y intent = métricas → rechazar con mensaje apropiado
   - Si intent = 'crear_pedido' → responder con link: `https://pizca.app/pedidos/new`

4. **Nodo guardar JID proveedor**: cuando llega mensaje al número ordering → si remoteJid no está en user_profiles → buscar en erp_providers por el chatId de conversaciones enviadas → guardar JID

### Paso 5 — n8n: env vars (docker-compose)

En el `docker-compose.yml` del servidor Oracle, bajo el servicio `n8n`:

```yaml
environment:
  - SUPABASE_URL=https://anszcyixjopxnskpxewg.supabase.co
  - SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...  # service role key
  - EVOLUTION_API_URL=http://wescaleops-evolution_api-1:8080
  - EVOLUTION_API_KEY=...  # API key de Evolution API
  # SEND_ORDER_WEBHOOK_URL se completa cuando se cree el workflow Fase 5
```

Restart: `docker compose up -d n8n` (solo reinicia ese contenedor)

### Paso 6 — Fase 5: n8n "Pizca - Send Order"

Workflow nuevo (pendiente):
- Webhook trigger → recibe `{ order_id }`
- Fetch order + lines de Supabase
- Agrupa lines por `provider_id`
- Para cada proveedor: envía mensaje via Evolution API **instancia ordering**
  - Si `channel = 'whatsapp'` → `POST evolution-api/message/sendText/{ordering_instance}`
  - Si `channel = 'email'` → nodo Email
  - Si `channel = 'telefono'` → marcar como manual
- PATCH `erp_purchase_orders.status = 'sent'`
- Una vez creado → genera la URL del webhook → se completa `SEND_ORDER_WEBHOOK_URL`

### Paso 7 — Chatwoot: conectar instancia ordering

En Chatwoot:
1. Crear inbox tipo "API" o "WhatsApp via Evolution API"
2. Conectar a la instancia ordering de Evolution API (webhook bidireccional)
3. Crear agentes: un agente por cada usuario de Pizca con rol `admin` o `owner`
4. Labels: por local (`cafeseamos`, `biergarten`, `78sabores`), por proveedor

---

## Orden de prioridades

| # | Tarea | Bloqueado por | Impacto |
|---|-------|--------------|---------|
| 1 | Migración Supabase (Paso 1+2) | — | Base de todo lo demás |
| 2 | n8n env vars via docker-compose | Ruta docker-compose confirmada | Desbloquea workflow Scheduled Orders |
| 3 | `/admin` en app (Paso 3) | Migración | QR + gestión de usuarios |
| 4 | Fase 5 Send Order (Paso 6) | — | Envíos reales a proveedores |
| 5 | Actualizar bot WA (Paso 4) | Migración | JID linking + roles en bot |
| 6 | Chatwoot setup (Paso 7) | Fase 5 + instancia ordering conectada | Bandeja de respuestas |

---

## Notas de implementación

- Evolution API corre en el mismo Docker network que n8n → acceder por nombre de contenedor: `http://wescaleops-evolution_api-1:8080`
- Chatwoot corre en `http://wescaleops-chatwoot_web-1:3000` (mismo network)
- El QR de Evolution API expira cada ~60 segundos → el componente `QRDisplay` debe hacer polling con `useEffect` + intervalo
- `PIZCA-{code}` debe ser un token seguro (8 chars alphanum), expirar en 15 minutos, almacenarse hasheado en user_profiles
