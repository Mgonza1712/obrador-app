---
name: documentation-system
description: Build and maintain the project documentation system for obrador-app without duplicating canonical context
---

## What I do

- Turn chat knowledge into versioned project documentation.
- Separate stable rules, domain knowledge, integrations, decisions, and temporary handoffs.
- Keep `CLAUDE.md` focused on invariants and operating rules.
- Help write or update `README.md`, `AGENTS.md`, and the `docs/` tree consistently.

## Canonical structure

- `README.md`: project overview, onboarding, command entrypoint, doc map
- `CLAUDE.md`: global rules, invariants, naming conventions, guardrails
- `AGENTS.md`: how human and AI agents should work in this repo
- `docs/architecture.md`: system map and repo boundaries
- `docs/domain/*`: business behavior and domain rules
- `docs/integrations/*`: Supabase, automation pipeline, external systems
- `docs/runbooks/*`: operational guides
- `docs/changes/*`: active or approved change specs
- `docs/decisions/*`: durable decisions
- `docs/handoffs/*`: temporary session state

## Writing rules

- Do not duplicate the same rule in multiple files unless one file is explicitly an index pointing elsewhere.
- Prefer the repo over chat history as the canonical destination.
- Use Notion to recover history, but migrate durable knowledge into the repo.
- Use Supabase MCP to verify schema facts before documenting them as true.
- Preserve exact field names shared across systems.
- Call out whether a total or price is `CON IVA` or `SIN IVA`.

## When to use me

Use this skill when:

- creating the initial documentation system
- converting meeting or chat context into repo docs
- documenting domain behavior around invoices, catalog, pricing, or escandallos
- cleaning up documentation sprawl between README, CLAUDE, Notion, and agent instructions
