# SOP — Reporting a clientes

Método: Manual Growth F5.5 + entregable de F5. Cómo corre HOY en DC.

## Reporte mensual (obligatorio — método)

Contenido mínimo (F5, entregable):
inversión realizada · resultados obtenidos · CAC · ROAS · ventas generadas ·
creativos destacados · aprendizajes · próximos tests · proyección del mes siguiente.

Flujo DC:
1. `reporting-performance` (mode `monthly`) draftea el reporte desde `metrics-log.md`,
   `performance-log.md`, `ads-log.md` y `sales-log.md` del cliente.
2. **Gate humano:** el director revisa y ajusta ANTES de compartir nada.
3. Se presenta al cliente (reunión o portal). Lo aprendido va a `learning-log.md`.

## Seguimiento continuo

- **Diario/semanal interno:** `reporting-performance` (modes `daily`/`weekly`/`insights`/
  `query`) para consumo del equipo — no va al cliente sin gate.
- **Digest semanal del portal:** email automático a clientes activos (lunes 9:00 UY) con
  resumen de actividad — contenido curado por el sistema, sin números sensibles.
- **Tendencias:** `sector-trends` publica semanalmente (viernes) en interno + equipo + portal.
- **Métricas por pieza:** `social-media-metrics` evalúa lo publicado y alimenta el learning
  loop (hook-database / winning-formats).

## Reglas

- Números siempre de fuentes registradas (logs del vault / Supabase) — si falta un dato, el
  reporte dice "Sin datos", no inventa. (Gap conocido: ingestión automática Meta = Stage 2.)
- Transparencia del método: el reporte cita qué se hizo según la fase de la metodología.
- El cliente nunca ve borradores ni logs internos (`learning-log`, `calls-log`).
