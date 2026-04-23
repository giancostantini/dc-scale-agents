# Competencia — {{CLIENT_NAME}}

Lista de competidores directos y piezas de referencia. El Competitor Scanner
lee este archivo 3x por semana y registra cada pieza nueva en
`competitor_pieces` de Supabase. El Consultor las inyecta como `examples[]`
en briefs del Content Creator.

## Formato

Cada entrada tiene que tener estos 3 campos mínimos. Separá entradas con `---`.

```
@handle | plataforma | url-del-post
tipo: reel | static | carousel | short | tiktok
hook: "el hook tal como aparece en el gancho del video/imagen"
format: double-drop | direct-value | ranking | testimonial | before-after | ...
notas: qué tiene de interesante esta pieza (opcional pero útil)
performance: views=12k, likes=800, comments=45 (opcional, se usa para rankear)
---
```

## Piezas capturadas

<!-- El scanner NO edita esta sección — la completás vos o el equipo cuando
     encuentran piezas relevantes. El scanner las lee, registra en Supabase y
     marca las nuevas como capturadas agregando `supabase_id: 123` abajo de cada una. -->


