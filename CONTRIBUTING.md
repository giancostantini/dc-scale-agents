# Como trabajamos — dc-scale-agents

Reglas del equipo. Leer antes de hacer tu primer commit.

## Regla de oro

**Nunca pushees directo a `main`.** Todo cambio pasa por branch + PR, incluso los chiquitos. Es la única forma de que los dos veamos qué está cambiando.

## Flujo de trabajo

Cada vez que te sentás a trabajar:

```bash
# 1. Traer lo último
git checkout main
git pull origin main

# 2. Crear tu branch
git checkout -b tipo/descripcion-corta

# 3. Trabajar, commitear seguido
git add .
git commit -m "verbo + que cambiaste"

# 4. Cuando terminás, pushear
git push origin tipo/descripcion-corta
```

Después abrís un PR en GitHub → titulo descriptivo → Merge.

## Naming de branches

Formato: `tipo/descripcion-corta`

| Tipo | Cuando usarlo | Ejemplo |
|------|---------------|---------|
| `feat/` | Funcionalidad nueva | `feat/dashboard-chart-revenue` |
| `fix/` | Bug fix | `fix/content-creator-voice-timing` |
| `refactor/` | Reestructurar sin cambiar comportamiento | `refactor/analytics-prompts` |
| `docs/` | Solo docs o specs | `docs/seo-agent-spec-v2` |
| `chore/` | Mantenimiento, secrets, deps | `chore/update-node-version` |

**Sin tu nombre en el branch.** GitHub ya sabe quien hizo cada commit.

## Commits

- Mensaje en ingles o espanol, consistente dentro del PR
- Verbo imperativo al inicio: "Add", "Fix", "Update", "Remove", "Refactor"
- Primera linea < 70 caracteres
- Si necesitas explicar el "por que", usa el cuerpo del commit

Ejemplos:
- `Add daily report mode to Analytics Agent` ✅
- `cambios varios` ❌
- `Fix Claude model ID (retired alias)` ✅
- `wip` ❌ (evitar, o usalo solo en commits que vas a squashear despues)

## Pull Requests

### Antes de abrir el PR
- [ ] Probaste que el cambio funciona localmente
- [ ] Si tocaste un agente, lo corriste al menos una vez (`node scripts/xxx/index.js`)
- [ ] El branch esta actualizado con main (`git pull origin main`)
- [ ] No hay secrets ni API keys hardcodeadas en el codigo

### Formato del PR
**Titulo:** verbo + que hace (igual que el commit principal)

**Body:**
```markdown
## Summary
1-3 bullets explicando que cambia

## Test plan
- [ ] Checklist de como verificar que funciona
```

### Quien mergea
- **Cambios chicos / no criticos:** el mismo autor puede mergear despues de pushear
- **Cambios grandes / que afectan produccion:** pedir revision al otro por Telegram antes de mergear

## Que commitear y que no

### ✅ SI commitear
- Codigo (`scripts/`, `dashboard/`, `remotion-studio/`)
- Specs y docs (`vault/agents/`, `vault/agency/`)
- Configuracion (`package.json`, `.github/workflows/`)
- Output generado por agentes en el vault (logs, calendarios, library) — **estos los commitean los Actions automaticamente**

### ❌ NUNCA commitear
- `.env`, `.env.local`, cualquier archivo con secrets
- `node_modules/`
- Archivos binarios grandes (videos > 50MB, renders)
- Keys de API, tokens, contrasenas — **ni siquiera en comentarios**

## Conflictos de merge

Si GitHub te dice "This branch has conflicts":

```bash
git checkout tu-branch
git pull origin main
# Resolves conflicts en VS Code
git add .
git commit -m "Merge main into tu-branch"
git push
```

Si no estas seguro, avisa por Telegram antes de resolver.

## Trabajando con Claude Code

- Antes de cada sesion: `git pull` en main, despues creas tu branch
- Al final de la sesion: commit + push, incluso si no terminaste (para que el otro vea en que andas)
- Si Claude Code te propone un cambio grande a archivos que el otro podria estar tocando, avisa primero por Telegram
- El archivo `CLAUDE.md` en la raiz es el onboarding de Claude Code — mantenerlo actualizado

## Secrets y API keys

- Los secrets viven en **GitHub → Settings → Secrets and variables → Actions**
- Nunca los pongas en el codigo, ni siquiera de forma temporal "para testear"
- Si necesitas agregar un secret nuevo, avisame y lo configuramos juntos
- La **publishable key de Supabase** es publica (safe) — puede estar hardcodeada en `dashboard/index.html`
- La **service_role key** NUNCA va en el dashboard — solo en scripts server-side

## Si algo rompe produccion

1. Revertir inmediato: crear PR que revierta el commit conflictivo, mergear
2. Avisar por Telegram
3. Arreglar en un branch nuevo con calma

## Preguntas frecuentes

**¿Puedo cambiar archivos en `vault/`?**
Sí, pero con cuidado. Los specs (`vault/agents/*/agent-spec.md`) son documentacion viva — actualizalos cuando cambias el agente. Los logs (`performance-log.md`, `content-library.md`, etc.) los escriben los Actions, no deberias editarlos a mano.

**¿Puedo eliminar un agente?**
Si, pero como PR separado con titulo tipo "Remove X agent". Hay que borrar: `scripts/X/`, `vault/agents/X/`, `.github/workflows/X.yml`, y el script en `package.json`.

**¿Como pruebo un agente localmente sin tocar produccion?**
Crea un cliente de prueba en `vault/clients/test/` y corre el agente con `node scripts/xxx/index.js test`. Nunca uses un slug de cliente real para testing.
