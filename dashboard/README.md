# Dashboard — D&C Scale

Panel de gestion interno. Deploy en Vercel, auth via Supabase.

## Setup inicial

1. Reemplazar en `index.html` el valor de `SUPABASE_PUBLISHABLE_KEY` con el publishable key real (Supabase → Settings → API Keys → Publishable key).
2. Crear usuarios en Supabase → Authentication → Users.
3. En Vercel, **Root Directory** debe ser `dashboard`.

## Desarrollo local

Abrir `index.html` con Live Server o cualquier servidor estatico. No requiere build.

## Estado

- UI: 100% funcional (data actualmente es mock)
- Auth: Supabase (email + password)
- Datos reales: pendiente — proxima fase es migrar a Next.js y conectar con Supabase / GitHub Actions
