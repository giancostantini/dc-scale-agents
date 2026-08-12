# Prompt Library — Content Creator
## Prompts probados y optimizados

### P001 — Reel/Video Script Generator
**Uso:** Generacion de script + storyboard completo para video
**Modelo:** claude-sonnet-4-20250514
**Max tokens:** 4096

**Acepta direccion creativa del brief:**
- objective, scriptFormat, emotionalTrigger, hookStyle, tone, angle, targetAudience, cta
- voice settings (style, language)
- visual settings (style, palette, aspectRatio)
- examples[] con notas de que copiar

**Output:**
1. Resumen (objetivo, formato, trigger, plataformas, duracion)
2. Triple Hook (visual + textual + verbal)
3. Script escena por escena (visual, texto, narracion, musica, transicion)
4. Storyboard de produccion (specs tecnicas para Remotion)
5. Texto de narracion completo (para ElevenLabs)
6. Captions listos (Instagram + TikTok)
7. Metadata (hook_category, script_format, assets_needed, music_style)

---

### P002 — Static Content Generator
**Uso:** Generacion de brief para NanoBanana Pro + copy completo
**Modelo:** claude-sonnet-4-20250514
**Max tokens:** 4096

**Acepta los mismos campos del brief que P001.**

**Output:**
1. Resumen (tipo, funnel stage, plataformas)
2. Direccion visual (layout, elemento dominante, paleta, estilo)
3. Textos exactos (headline, subheadline, callouts, CTA)
4. Brief estructurado para NanoBanana Pro (listo para enviar)
5. Captions listos (Instagram + Facebook Ads)
6. Metadata (static_type, funnel_stage, assets_needed)

---

### P003 — Caption Generator (standalone, futuro)
**Estado:** Embebido en P001/P002. Se puede separar cuando se necesite generar captions sin regenerar toda la pieza.

**Reglas por plataforma:**
- Instagram: emocional, emojis estrategicos, max 8 hashtags
- TikTok: directo, corto, gancho conversacional
- LinkedIn: profesional, dato concreto, sin emojis excesivos
- Facebook Ads: copy persuasivo, pain→solution, CTA claro

---

### P004 — Reference Analyzer (futuro)
**Estado:** PENDIENTE — se activa cuando el agente pueda procesar video/imagen
**Uso:** Analizar un ejemplo de referencia y extraer patrones replicables
**Input:** URL o archivo de referencia + notas
**Output:** Estructura detectada, hook usado, pacing, elementos visuales clave, que replicar
