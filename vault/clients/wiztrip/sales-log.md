# Sales Log — WizTrip

> Registro de reservas confirmadas, valor por reserva, canal y producto. Agentes que lo leen: `reporting-performance`. (Stock y logistics NO aplican porque WizTrip no maneja inventario físico ni shipping.)

## Cómo registrar

Cada vez que se confirma una reserva, agregar al final una fila a la sección del día:

```
## YYYY-MM-DD

| Booking ID | Cliente (nombre) | Destino | Salida | Pax | Total USD | Canal | Producto / paquete |
|---|---|---|---|---|---|---|---|
| WT-2026-0001 | Juan P | Punta Cana | 2026-12-15 | 2 | 1250 | Meta Ads | Paquete 7 noches |
| WT-2026-0002 | Laura M | Cancún | 2026-12-20 | 4 | 2800 | Referido | Paquete familiar 10 noches |
```

## Convenciones

- **Canal**: Meta Ads / Google Ads / TikTok / Email / Referido / Walk-in / Otro.
- **Producto**: matchear con un nombre listado en `product-catalog.md` para que los reportes correlacionen ventas con producto.
- **Pax** (passengers): número de personas en la reserva.
- **Total USD**: precio final cobrado, conversión a USD si la moneda original es otra.

## Notas

- Reservas canceladas: agregar fila negativa con misma estructura, monto en negativo, columna "Producto" indicando "[CANCELACIÓN]".
- Si el cliente NO comparte sales-log porque no es transparente con su equipo: dejar este archivo vacío. El `reporting-performance` lo va a reportar como "Sin datos de ventas".

---

(sin entradas todavía)
