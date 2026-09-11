---
type: agent-config
updated: 2026-09-11
---

# Enriquecimiento de contactos — reglas y presupuesto

Cómo el Prospector pasa de *"la empresa X busca un community manager"* a
*"hablale a Fulana, gerente de marketing, a este mail"*.
Volver: [Gerencia de Ventas](../../empresa/Gerencia%20de%20Ventas.md) ·
[Método de búsqueda](busquedas.md)

## Estado: DORMIDO hasta que haya API key

Sin `APOLLO_API_KEY` el agente corre igual y carga los prospectos a nivel
empresa; el reporte del run lo dice en vez de fallar. Nada se rompe por no
tenerlo.

## Antes de pagar: medí

Apollo es fuerte en EEUU y, dentro de Latam, en **Brasil y México**.
**Uruguay —nuestro mercado principal— es de sus zonas más flojas.** Antes de
poner una tarjeta:

```bash
node scripts/prospeccion/coverage.js
```

Toma las empresas que ya están en el pipeline y responde con números: en
cuántas encuentra a alguien del cargo que buscamos y en cuántas hay email
disponible. **No gasta créditos** (usa solo la búsqueda, que es gratis; lo
que cuesta es revelar los datos).

Cómo leer el resultado:

| Cobertura con email | Qué hacer |
|---|---|
| > 60% | Sirve. La suscripción se paga sola. |
| 30-60% | A medias: usarlo solo para las empresas más grandes, el resto a mano. |
| < 30% | No pagarlo para este mercado. Buscar el contacto a mano o probar otro proveedor. |

## Reglas de gasto (no negociables)

- **Nunca** se piden teléfonos ni búsqueda en cascada: ahí un contacto pasa
  de costar ~1 crédito a ~9.
- Se revela **solo a quien la búsqueda marca con email disponible** —
  revelar a alguien sin email gasta un crédito para nada.
- **Tope duro por corrida**: 20 créditos (`ENRICH_BUDGET_PER_RUN`),
  contando lo que la API dice que gastó, no una estimación. Al llegar al
  tope se corta y queda registrado en el reporte.
- Un error de autenticación (plan sin acceso a la API) corta la tanda en el
  primer intento en vez de insistir.

## Si algún día cambiamos de proveedor

La lógica vive en `scripts/lib/enrichment.js` detrás de una interfaz
(`enrichCompanyContacts`). Agregar otro proveedor es escribir su
implementación ahí; el agente no se toca.
