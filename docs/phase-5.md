# Fase 5: reportes y asistencia financiera

## Implementado

- El dashboard obtiene sus métricas mediante `buildDashboardSummary` en `src/services/ledger.ts`: capital por módulo y cuenta, resumen del día/mes, jornada, ahorro, avance de meta, actividad personal reciente y recomendaciones basadas en movimientos activos.
- Los reportes diario, semanal, mensual y anual presentan totales y comparaciones. `buildFinancialReportAnalytics` prepara las series temporales, categorías de gasto, capital, ahorro, cuentas y duración de jornada para los gráficos.
- Los gráficos usan Recharts y se actualizan cuando cambia la instantánea del libro.
- Los gastos seleccionados manualmente alimentan reglas de clasificación a través de `ClassificationService` después de guardar el movimiento.
- La clasificación compara reglas exactas y parciales, y puede recurrir a movimientos históricos del módulo correspondiente.
- La búsqueda global vive en el dashboard y consulta movimientos, jornadas, transferencias, ahorros y reportes.
- La exportación acepta un rango de fechas; genera CSV, un libro HTML compatible con Excel y una tabla imprimible que el navegador puede guardar como PDF.
- Las preferencias de recordatorios se guardan en `localStorage`; IndexedDB y su esquema no cambian. Los avisos se calculan desde movimientos y jornadas existentes, y se deduplican por día.
- La restauración de respaldos valida la estructura y reemplaza los datos en una transacción. Si la importación falla, la transacción se revierte.

## Verificación

- Suite Vitest: 39 pruebas aprobadas en 9 archivos. Incluye cálculos de dashboard, reportes, búsqueda, exportación de filas, recordatorios, restauración de respaldos y clasificación desde historial.
- `npm.cmd run build`: compilación de TypeScript, Vite y generación del service worker aprobadas.
- Vite muestra advertencias de anotaciones de comentarios en `zod`; la compilación termina correctamente.

## Alcance pendiente

Consulta `TODO.md` para limitaciones que requieren decisiones o pruebas adicionales, como avisos mientras la aplicación está cerrada, aislamiento de reglas de categoría por módulo, cifrado local y comprobaciones manuales en navegador.
