# Pendientes de optimización y validación

- [ ] Evaluar notificaciones persistentes mientras la aplicación está cerrada. Los recordatorios actuales solo se disparan mientras la aplicación está abierta y el navegador ha concedido permiso.
- [ ] Definir un mecanismo de cifrado local compatible con la persistencia actual. No se añadió cifrado porque la Fase 5 prohíbe modificar la base de datos; cifrar requiere decidir dónde guardar/derivar la clave y cómo migrar datos existentes sin pérdida.
- [ ] Revisar el modelo global de reglas de clasificación: `ClassificationRule` no identifica módulo, por lo que una palabra aprendida en finanzas personales puede influir en el negocio.
- [ ] Verificar manualmente en navegador impresión/guardado PDF, exportación Excel, permisos y comportamiento de recordatorios en los navegadores objetivo.
- [ ] Ejecutar pruebas manuales de modo sin conexión y revisar la consola del navegador en escenarios de restauración y exportación.
- [ ] Medir `buildFinancialReportAnalytics` con 10.000 o más movimientos; el test de rendimiento existente cubre las consultas anteriores, no esta nueva agregación de gráficos.
- [ ] Evaluar filtros globales con controles separados por fecha, cuenta, categoría, importe y tipo. La búsqueda global actual combina términos libres de esos campos.
- [ ] Acordar si la entrega de Excel debe convertirse a `.xlsx` nativo; ahora se genera una hoja HTML compatible con Excel (`.xls`) sin añadir dependencias.
- [ ] Investigar cuentas duplicadas de Efectivo y Nequi observadas en los saldos del negocio durante la revisión visual. Parecen corresponder a registros preexistentes de IndexedDB; no consolidar ni eliminar cuentas sin una migración segura que preserve saldos e historial.
