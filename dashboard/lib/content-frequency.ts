/**
 * Distribución de días sugeridos según la frecuencia semanal de
 * publicación.
 *
 * Convención de días: 0=Lun, 1=Mar, 2=Mié, 3=Jue, 4=Vie, 5=Sáb, 6=Dom
 * (Lun-first, igual que el calendario del planificador).
 *
 * Estrategia: spread "natural" — distribuir uniforme respetando que
 * los días "más fuertes" para engagement son entre semana (Lun-Vie),
 * y Sáb-Dom solo entran cuando la frecuencia es alta.
 *
 * - 1/sem: Mié
 * - 2/sem: Mar, Jue
 * - 3/sem: Lun, Mié, Vie
 * - 4/sem: Lun, Mar, Jue, Vie
 * - 5/sem: Lun-Vie
 * - 6/sem: Lun-Sáb
 * - 7/sem: Lun-Dom
 */
export function suggestedWeekdays(perWeek: number): Set<number> {
  const map: Record<number, number[]> = {
    1: [2],                     // Mié
    2: [1, 3],                  // Mar, Jue
    3: [0, 2, 4],               // Lun, Mié, Vie
    4: [0, 1, 3, 4],            // Lun, Mar, Jue, Vie
    5: [0, 1, 2, 3, 4],         // Lun-Vie
    6: [0, 1, 2, 3, 4, 5],      // Lun-Sáb
    7: [0, 1, 2, 3, 4, 5, 6],   // Lun-Dom
  };
  return new Set(map[perWeek] ?? []);
}

/**
 * Convierte una fecha JS a su día de la semana en convención
 * Lun=0..Dom=6.
 */
export function weekdayLunFirst(date: Date): number {
  return (date.getDay() + 6) % 7;
}
