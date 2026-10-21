# Arquitectura de datos

## Límites

- `models/` contiene contratos Zod y los tipos inferidos de los registros persistidos.
- `validators/` ofrece adaptadores `safeParse` para entradas externas y consultas controladas.
- `database/` declara `FinanceAssistantDB`, versiones Dexie y migraciones. Ningún servicio de dominio debe importar tablas Dexie.
- `repositories/` encapsula consultas, CRUD, índices, eliminación lógica, restauración y errores de persistencia.
- `finance-unit-of-work.repository.ts` coordina escrituras atómicas en más de una tabla. Los servicios reciben repositorios por constructor y no conocen IndexedDB.
- `services/` concentra validaciones de negocio, categorías, jornadas, ahorro, capital y metas. Devuelve `ServiceResult<T>` para fallos esperables.
- `utils/identity.ts` genera UUID v4 y mantiene un `deviceId` estable en metadata. `utils/logger.ts` evita registrar descripciones o importes.

## Esquema y versiones

La base se llama `FinanceAssistantDB`. La versión 1 crea Settings, PersonalMovement, BusinessMovement, Journey, Saving, Capital, DailyGoal, ClassificationRule y metadata. La versión 2 agrega a movimientos `version`, `synced`, `syncVersion` y `deviceId`; `migrateV1ToV2` rellena valores para datos previos.

Los IDs de Settings (`global`) y Capital (`current`) son claves singleton. Los movimientos usan UUID como clave primaria. Las tablas de movimiento indexan fecha, descripción, categoría, tipo, método de pago y, en el negocio, `journeyId`. Las fechas se guardan como ISO 8601 UTC. Las búsquedas textuales usan el índice de descripción y coincidencia por prefijo; `search` agrega filtros en memoria cuando se combinan campos.

## Consistencia de dominio

- Zod valida cada escritura antes del repositorio y vuelve a validar el cierre de jornada, capital y meta calculados.
- Los servicios retornan `{ ok: true, value }` o `{ ok: false, error }`; repositorios traducen errores Dexie a códigos estables.
- Los movimientos del negocio se asocian únicamente a una jornada activa.
- El cierre actualiza jornada, depósito de ahorro y Settings dentro de una transacción única del Unit of Work.
- Depósitos, retiros, eliminación y restauración recalculan el historial de ahorro en orden cronológico y rechazan cualquier operación que produzca saldo negativo.
- Capital y metas se derivan de movimientos/historial; Capital solo permite persistir una instantánea calculada.

## Sincronización

Los movimientos incluyen `synced`, `syncVersion`, `version` y `deviceId` para preparar un transporte futuro. Esta fase no configura servidor, resolución de conflictos ni sincronización remota. La base actual es local al navegador.

## Rendimiento y pruebas

`src/tests/performance.test.ts` inserta 10.000 movimientos en IndexedDB simulado, consulta fecha/rango/descripción y conteo, y exige completar las consultas en menos de 15 segundos. Es una medición de regresión sobre `fake-indexeddb`, no un benchmark de hardware de producción.
