---
name: naraflows
description: Coordinar solicitudes de NaraFlows, identificar la sesión y dirigir el trabajo a modelado, validación o entrega. Usar cuando el usuario elija este modelador o necesite un trabajo que combine esas acciones.
---

# Coordinar NaraFlows

Este plugin contiene cuatro skills, scripts compartidos y un MCP local; se instala una sola vez desde Nara IA Market. Usa el editor existente y archivos BPMN independientes. No generes otro visor ni instales un segundo MCP.

Lee [el contrato compartido](../../shared/workflow.md) para conexión, capacidades, revisiones, recuperación y conservación. Reutiliza una sesión que corresponda al archivo solicitado; la presencia del plugin no demuestra conexión. Con varias pestañas no identificables, pide solo el dato que falta.

Selecciona el objetivo y carga únicamente su skill:

- Crear o cambiar el diagrama: [naraflows-modelar](../naraflows-modelar/SKILL.md).
- Revisar un diagrama: [naraflows-validar](../naraflows-validar/SKILL.md). Una revisión por sí sola no autoriza correcciones.
- Guardar, exportar o preparar un informe: [naraflows-entregar](../naraflows-entregar/SKILL.md).

Para un montaje nuevo, resuelve con las fuentes y decisiones existentes: alcance, nivel de formalización (representación para revisión o reglas BPMN formales), responsables internos/participantes independientes, etapas, detalle/hojas y destino editable. Pregunta solamente lo que no se pueda inferir y cambie materialmente el resultado. No repitas preguntas ya resueltas ni impongas un levantamiento completo para una corrección pequeña.

## Recorrido habitual para cambios sencillos

Objetivo operativo: una lectura de preparación, un bloque de edición/presentación y una única confirmación visual cuando corresponda. Reutiliza las instrucciones ya leídas, sesión, esquema y capacidades verificados mientras no cambien servidor, contrato, build o pestaña. No vuelvas a explorar el catálogo de herramientas, repositorio, historial de publicación o documentación para cada figura. Los fallos del producto se investigan como trabajo de mantenimiento cuando realmente impiden continuar; una petición de dibujo no exige repetir una auditoría del producto.

En la primera consulta usa `read(detail:"summary",waitForReadyMs:5000)`: puede resolver una única sesión vinculada sin llamar antes a `sessions`. Si informa que no hay vínculo, sigue la [vinculación](../../shared/workflow.md#sesión-y-capacidades): un código nuevo vence en cinco minutos y el panel de navegador integrado de Claude no puede vincular; usa el Chrome o Edge del usuario. Para operaciones de hoja usa `edit` con `response:"summary"`; para una copia del XML, `export_bpmn` en vez de `includeXml`. Varias sesiones requieren identificar la correcta. Exige `documentReady:true` y `readiness.canEdit:true`. La respuesta trae sesión, archivo, hoja, revisión, versión, disponibilidad y autoguardado. Para una edición sobre contenido existente cuya geometría no conozcas, pide una lectura completa; si la revisión/hash coincide con el snapshot completo ya conocido, reutilízalo. Una edición o recarga externa invalida esa reutilización.

Usa `edit_batch(response:"summary",presentation:{expandedCanvas:true},fit:true)` cuando debas ampliar y encajar. Incluye todas las operaciones compatibles en ese bloque. Reutiliza alias/revisión/validación devueltos: no añadas consultas o una segunda auditoría solo para repetir información ya confirmada. No vuelvas a encajar después del bloque. Una captura del lienzo basta para confirmar una solicitud visual; exporta PNG cuando se pida una imagen/informe o sea la única comprobación visual disponible, evitando producir ambas evidencias por rutina.

El MCP espera de forma acotada a la inicialización, recuperación Microsoft y autoguardado. Si devuelve un diagnóstico pendiente después de esa espera, permite como máximo otra consulta ligera solo cuando haya progreso real o haya transcurrido el `retryAfterMs` indicado. No encadenes la misma lectura fallida. `retryable:false` requiere su recuperación concreta; `FORM_PENDING` o un selector abierto no autorizan a descartar contenido. Ante cambio de revisión, conserva la edición manual y relee para reconciliar, sin sustituirla a ciegas.

El tiempo de un bloque no es toda la espera del usuario. `timings` separa preparación, prevalidación, aplicación, presentación, confirmación y transporte; `firstVisibleMs` solo existe si se confirmó un cuadro visible del editor. No atribuyas a voz/modelo una latencia que el MCP no observa. Prioriza el primer resultado visible y comunica solo el resultado o un bloqueo útil, sin repetir promesas de avance.

## Ritmo según el modo de interacción

Usa la señal de voz o texto que proporcione el host. Una transcripción o una frase coloquial no demuestra que la voz siga activa. Si el host no informa el modo, sigue la preferencia explícita del usuario; no hagas una pregunta adicional solo para clasificarlo. Si cambia de modo, conserva lo ya acordado y adapta el ritmo.

En voz o cuando pide «muéstrame», prioriza un borrador visible y reversible. Resuelve decisiones de presentación con criterio; conserva dudas y pendientes fuera del lienzo y no inventes pasos o reglas de negocio. Evita cuestionarios previos, relatos de herramientas y anuncios repetidos. Comunica solo un resultado, bloqueo real o pregunta indispensable. Si una operación no existe, dilo al comprobarlo, antes de anunciar que vas a ejecutarla. No prometas tiempos de respuesta que no hayas medido.

Por escrito, si el usuario está explorando o planificando, ayuda a precisar el diseño mediante preguntas breves y opciones concretas. Consolida sus decisiones y ofrece una sola entrega coherente cuando el diseño esté listo. No publiques sucesivos borradores sin que aporten valor. Una petición directa de ejecutar, rapidez o borrador visual prevalece sobre este ritmo; planificar no autoriza implementar.

Comprueba sesión, versión y operaciones del contrato realmente cargado antes de una edición estructural. Una versión instalada no actualiza un chat abierto. Si este conserva herramientas antiguas, no pruebes tipos que su esquema no admite ni crees un contenedor incompleto anunciándolo como una matriz. Indica la recuperación soportada sin perder el documento; no uses un segundo servidor para ocultar esa limitación.

Reutiliza la sesión y las lecturas confirmadas. Para una matriz usa la operación estructural; para varias ediciones compatibles usa un bloque con alias. La respuesta confirmada aporta la revisión siguiente: no repitas lecturas completas sin motivo. La lectura resumida sirve para estado, no para una revisión integral. Deja que el autoguardado gestione el destino ya autorizado; no abras selectores, hagas copias locales ni fuerces guardados por rutina. Encajar o mostrar el lienzo se solicita por MCP. El navegador solo cubre vinculación o evaluación visual autorizada, no sustituye operaciones que faltan en un chat antiguo.

En tareas combinadas coordina modelado → validación → entrega, conservando la misma sesión, hoja y versión. El archivo y su contenido pertenecen al proyecto elegido; las mejoras genéricas de la herramienta se trabajan con pruebas genéricas en su propio repositorio. No incluyas datos de clientes en el paquete del plugin.

Para correcciones de texto, tamaño, rutas, documentos y notas, sigue [edición visual y calidad](../../shared/visual-editing.md). Preserva las correcciones manuales y usa un bloque compatible por conjunto afectado.

Para gestionar una ubicación OneDrive/SharePoint expresamente solicitada, lee [el contrato de archivos Microsoft](../../shared/microsoft-files.md) y comprueba microsoft-files-v1. Una revisión sin cambios sigue siendo de solo lectura: no abre, crea, guarda ni activa autoguardado por inferencia.

Para un montaje o reorganización amplia, modelado aplica [composición](../../shared/composition.md): comparar ancho/alto/área, evaluar filas sin imponerlas y planear conexiones como conjunto. La ausencia de errores BPMN no decide la calidad de la distribución. No cargues esta referencia completa por un renombrado o una exportación.
