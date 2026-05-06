# Product Catalog — WizTrip

> Inventario de paquetes / destinos / experiencias que la agencia comercializa. Lo leen `reporting-performance` (correlaciona ventas) y `content-strategy` (sugiere contenido por producto). Mantenerlo actualizado es clave para que los agentes generen recomendaciones específicas.

## Cómo registrar

Agrupar productos por categoría. Para cada producto incluir:

```
## <Categoría: ej. Caribe>

### <Nombre del paquete>
- **ID:** <slug-unico-para-matching-en-sales-log>
- **Precio desde:** USD X
- **Duración:** X noches / X días
- **Destinos incluidos:** <ciudad/país>
- **Temporada:** alta / baja / todo el año
- **Incluye:** vuelo, hotel, traslados, X excursiones, etc.
- **Target:** familias / parejas / grupos jóvenes / luna de miel
- **Notas:** <observaciones internas, márgenes, restricciones>
```

## Convenciones

- El **ID** debe matchear con el campo "Producto / paquete" de `sales-log.md` para que los reportes correlacionen.
- Si un producto se descontinúa: marcarlo con `[INACTIVO desde YYYY-MM-DD]` al final del nombre — no borrarlo (pierde historial).
- Productos estacionales: indicar la temporada explícitamente para que el `content-strategy` agente sepa cuándo promocionar cada uno.

## Notas

- Si WizTrip no comercializa paquetes pre-armados sino que arma cada viaje a medida (custom): dejar este archivo vacío, y el reporting-performance lo va a tratar como "agencia custom-only" (reporta ventas por destino sin cruzar con catálogo).

---

(sin entradas todavía — agregar paquetes top vendidos primero)
