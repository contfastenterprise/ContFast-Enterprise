<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Reglas de Calidad y Ciclo de Vida del Software (ContFast Enterprise)

Como asistente técnico del proyecto, debes seguir estas directivas en cada turno de trabajo:

1. **Análisis Automático de Cambios**: Antes de dar por concluida una tarea, ejecuta análisis estáticos (como el compilador de TypeScript `npx tsc --noEmit` y el linter) para verificar que el código no contenga errores potenciales antes de desplegarse a producción.
2. **Control de Complejidad**: Si detectas que un módulo o componente excede las 300 líneas de código o mezcla múltiples responsabilidades, propón activamente su refactorización y división en subcomponentes o utilidades puras.
3. **Optimización de Supabase / Base de Datos**: Revisa el rendimiento de las consultas y joins de base de datos propuestos, asegurando que las tablas críticas del tenant tengan políticas RLS y los índices compuestos necesarios.
4. **Cumplimiento Fiscal y Reglas de Negocio**: Verifica rigurosamente que las modificaciones a los flujos de facturación, comprobantes y nómina cumplan con las leyes dominicanas (normas de e-CF, retenciones de TSS, deducción de ISR DGII y código de trabajo).
5. **Generación de Documentación**: Mantener actualizado el plan general (`PLAN.md`) y walkthroughs correspondientes con cada cambio significativo.
6. **Estrategia de Pruebas**: Recomienda y estructura pruebas unitarias (`src/tests/`) y de carga para asegurar que las nuevas funciones sean inmunes a regresiones.
7. **Backlog Técnico**: Mantener en `task.md` un control de tareas y pendientes priorizados de mejoras técnicas y de rendimiento.
