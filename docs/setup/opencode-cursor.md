# OpenCode en Cursor con WSL

## Qué deja preparado este repo

- `opencode.json` con configuración compartida del proyecto
- agente primario `docs` en `.opencode/agents/docs.md`
- skill `documentation-system`
- `.cursor/mcp.json` con `Supabase` y `Notion`
- `.cursor/rules/01-project-context-routing.mdc`

## Estado actual

`WSL` ya está habilitado y `Ubuntu` quedó instalada en esta máquina, pero la primera inicialización de la distro no se pudo completar de forma no interactiva desde esta sesión. Hay que terminar ese primer arranque una vez.

## Paso manual único para desbloquear WSL

1. Abre `Ubuntu` desde el menú Inicio o ejecuta `wsl -d Ubuntu` en una terminal normal.
2. Completa el bootstrap inicial si Windows te lo pide.
3. Cierra la terminal.

## Instalación recomendada de OpenCode en WSL

Dentro de Ubuntu:

```bash
curl -fsSL https://opencode.ai/install | bash
```

Alternativa con Node.js:

```bash
npm install -g opencode-ai
```

## Configuración global sugerida

Crea `~/.config/opencode/opencode.json` en WSL con este contenido base:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "openai/gpt-5",
  "small_model": "openai/gpt-5",
  "provider": {
    "openai": {
      "options": {
        "apiKey": "{env:OPENAI_API_KEY}"
      }
    }
  }
}
```

Si OpenCode expone `GPT-5.4` en `opencode models openai`, cambia en `opencode.json` el `id` del modelo `gpt-5-docs` de `gpt-5` a `gpt-5.4`.

## Autenticación recomendada

### OpenAI

```bash
opencode auth login
```

Selecciona `OpenAI` y completa el login o pega tu API key.

### Supabase MCP

```bash
opencode mcp auth supabase
```

Esto abrirá el login OAuth del servidor MCP remoto de Supabase.

### Notion MCP

```bash
opencode mcp auth notion
```

Esto abrirá el login OAuth del servidor MCP remoto de Notion.

### n8n MCP

En tu instancia de `n8n`, activa el acceso MCP en `Settings > Instance-level MCP`.

Desde el panel de `Connection details`, copia:

- la URL del servidor MCP de la instancia
- tu `MCP Access Token` personal

Luego, en Ubuntu:

```bash
echo 'export N8N_MCP_URL="PEGA_AQUI_LA_URL_DEL_MCP_DE_N8N"' >> ~/.bashrc
echo 'export N8N_MCP_TOKEN="PEGA_AQUI_EL_TOKEN_DE_N8N"' >> ~/.bashrc
source ~/.bashrc
```

La configuración del repo ya usa esas variables en `opencode.json`.

## Uso desde Cursor

1. Abre el repo en Cursor.
2. Trabaja sobre el workspace en WSL para que el terminal y OpenCode usen el mismo árbol de archivos.
3. Verifica que el comando `cursor` esté disponible en PATH.
4. Ejecuta `opencode` desde la terminal integrada de Cursor.
5. Cambia al agente `docs` cuando quieras trabajar la documentación.

## Comprobaciones rápidas

```bash
opencode models
opencode mcp list
opencode mcp debug supabase
```

Para `n8n`, una vez cargadas las variables:

```bash
opencode mcp list
```

Deberías ver `n8n connected`.

## Notas

- La configuración del proyecto está en `opencode.json` y se comparte por Git.
- Las credenciales y preferencias globales deben quedarse fuera del repo.
- `Supabase` está configurado en modo `read_only` y limitado al proyecto `anszcyixjopxnskpxewg`.
