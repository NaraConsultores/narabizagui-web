# NaraFlows — plugin local

**NaraFlows 0.12.0** es el nuevo nombre de NaraBizagui. Instala `naraflows@nara-ia-market` en Codex o Claude Code y usa un chat nuevo para las herramientas `naraflows_*`. Las sesiones anteriores conservan su servidor hasta cerrarlas; el editor abre los mismos BPMN/ER.

La versión 0.11.0 incluye cuatro skills, scripts compartidos, diecisiete herramientas MCP y el contrato `visual-quality-v1`. El recorrido habitual es una consulta de preparación, un bloque de edición/presentación y una confirmación visual cuando corresponde. Conserva procesos completos, revisión obligatoria, prevalidación, idempotencia y Deshacer/Rehacer.

## Novedades 0.11.0 (servidor 0.11.0, web 0.11.5)

- `matrix.activities` admite `width`/`height` y la matriz `activitySize`; sin ellos se conserva 100×80. Las conexiones de `links` admiten `as` y `label` para nombrar ramas Sí/No.
- Un bloque rechazado devuelve `failedOperation` (índice, tipo, `elementId`, alias y `cell` en la matriz), también para `ROUTE_BLOCKED` y alias repetidos o reservados.
- `edit` acepta `response:"summary"` para `sheet_link`, `sheet_rename`, `sheet_open` y demás operaciones individuales: devuelve revisión y hojas sin el snapshot completo.
- `naraflows_export_bpmn` escribe el XML completo en un `.bpmn` temporal con `sha256`, sin enviarlo al chat.
- `clear` conserva el nombre de la hoja y los IDs de colaboración y proceso (mantiene un participante vacío que la siguiente `matrix` reutiliza) y devuelve `sheet` con `preserved`.
- Skills: patrón de macroproceso conectado, vinculación desde Chrome/Edge (el panel integrado de Claude bloquea `/pair`), fórmulas de geometría de `matrix` y etiquetas de datos al costado.

Las capacidades nuevas requieren la web 0.11.5 y un chat que haya cargado el servidor 0.11.0; compruébalas en `read.capabilities` (`matrixActivitySize`, `matrixLinkLabels`, `clearPreservesSheet`, `operationErrorDetail`, `editSummary`).

Modelado y revisión conservan la [regla común de responsables y etiquetas](shared/workflow.md#responsables-y-etiquetas-del-flujo). La web 0.11.0 y el servidor 0.10.0 incorporan composición proporcionada, rutas adaptativas y gestión acotada de archivos Microsoft.

Con web 0.9.3, `share_connection` permite compartir un tramo de llegada (`end:"target"`) o salida (`end:"source"`) entre conexiones que conservan el mismo destino u origen, respectivamente. Recibe `elementId`, `withConnectionId`, `x`, `y` y `end`; admite alias en un bloque. Cada conexión conserva ID, extremos y selección independiente. No crea compuertas ni uniones semánticas implícitas. El editor muestra el mismo recorrido en la previsualización y al soltar, conserva los ajustes manuales viables y permite acoplar segmentos cercanos sin diagonales. La ampliación es compatible con el contrato previo, pero un servidor antiguo no expone la operación nueva: comprobar el esquema real y `capabilities.batchOperations`.

## Preparación y presentación en una petición

`read` devuelve resumen por defecto y espera una sola vez, hasta cinco segundos, a la inicialización y recuperación de Microsoft. Si hay una única pestaña vinculada puede identificarla sin `sessions`; varias requieren `sessionId`. Un diagnóstico con `documentReady:false` no autoriza editar. Los fallos de carga son distintos de los estados temporales y conservan motivo, posibilidad de reintento y recuperación de extremo a extremo. No se sobrescribe un fallo de apertura con un mensaje de inicio normal.

`edit_batch` combina las operaciones con `presentation:{expandedCanvas:true}` y `fit:true`. Su respuesta resumida conserva alias, revisión/hash, validación y autoguardado; `response:"full"` incluye figuras. Las skills reutilizan instrucciones/capacidades vigentes, evitan reintentos idénticos y eligen una sola comprobación visual. No generan capturas, exportaciones o guardados duplicados por rutina.

Las métricas `timings` describen fases del editor y transporte. `firstVisibleMs` solo se devuelve tras un cuadro visible confirmado; no mide la espera completa del usuario ni la latencia del modelo/voz. Una pestaña en segundo plano no acredita un primer cuadro visible. La presentación tiene una espera acotada y no invalida una edición confirmada.

## Procesos completos y respuesta ágil

`naraflows_sessions` informa la versión del servidor y su contrato realmente activos. `read(detail:"summary")` devuelve revisión, capacidades, autoguardado y disponibilidad sin enviar la geometría completa; no sirve para una auditoría integral. `read` puede consultar el modelo durante un guardado y reutiliza la serialización de una revisión sin cambios. Las mutaciones esperan hasta cinco segundos a un guardado/sincronización en curso y comprueban de nuevo la revisión; nunca sobrescriben una edición posterior ni fuerzan un formulario pendiente.

`matrix` crea participante, carriles BPMN nativos, etapas, figuras y conexiones. Recibe `lanes` y `stages` (nombres), `activities` (clave, nombre, tipo opcional, `lane` y `stage` desde uno, `width`/`height` opcionales para actividades), `activitySize` opcional y `links` (`from` y `to` con esas claves, `as` y `label` opcionales). Las fórmulas de posición están en [modelado](shared/modeling.md#geometría-de-matrix). Los desplazamientos opcionales `xOffset/yOffset` colocan varias figuras en una celda; deben caber y no superponerse. Puede reutilizar un participante expandido vacío mediante `poolId`. Devuelve alias `pool`, `lane1…`, `stage1…` y claves de actividades; esos nombres de contenedores están reservados. Conserva el contenido previo de la hoja y las demás hojas.

`clear` requiere `scope:"active"` y limpia solo la hoja activa, con Deshacer; desde la web 0.11.5 conserva nombre e IDs de la hoja y lo informa en `sheet`. Ambas operaciones pasan por la misma prevalidación temporal, comprobación de revisión, caché de solicitudes y recuperación de bloques. Para agrupar limpieza y reconstrucción usa `edit_batch`, un UUID estable y operaciones `clear` + `matrix`; se deshacen juntas. Los bloques admiten también `lane_split/lane_add`. `fit:true` encaja al finalizar y `edit(operation:{type:"fit"})` encaja sin cambiar el archivo. Los resultados del bloque incluyen duración y espera del editor; estos tiempos no representan toda la latencia del modelo o de voz.

`requireValid:true` impide aplicar un plan con errores de auditoría y devuelve la geometría temporal en `previewElements` para corregirlo. `create` y `resize` admiten `autoResize:false` para mantener contenedores previamente dimensionados; las figuras deben caber dentro de ellos. Se conserva el ajuste automático nativo cuando se omite.

La conexión de un chat abierto no se actualiza al instalar otro paquete. Si las herramientas cargadas no exponen estas operaciones, conserva el documento y abre una conversación nueva con el plugin actualizado; no anuncies una matriz antes de comprobarlo. Las skills priorizan un borrador visible en voz y una entrega consolidada después de iterar por escrito, siempre subordinadas a la solicitud explícita del usuario. El autoguardado conserva su destino; no se abren selectores ni se crean copias locales por rutina.

| Skill | Objetivo |
| --- | --- |
| `naraflows` | Coordinar y elegir el recorrido proporcional a la solicitud. |
| `naraflows-modelar` | Crear o corregir el modelo mediante MCP, preservando elementos ajenos. |
| `naraflows-validar` | Auditar sin modificar, con incidencias y límites de cobertura. |
| `naraflows-entregar` | Conservar el editable y exportar PNG con revisión y hoja. |

Las skills comparten el contrato y los analizadores de `shared/`; no duplican reglas ni requieren instalaciones separadas. No necesita `npm install` después de instalarlo: el servidor distribuido incluye sus bibliotecas y atribuciones.

## Requisitos e instalación

- Codex/host de escritorio con plugins y ejecución local.
- Node.js **22 o superior** disponible como `node` en el entorno del host. El runtime no está incluido; se requiere una vez por equipo.
- Edge/Chrome de escritorio con acceso local permitido para la web del editor. Otros navegadores deben verificarse antes de declararlos compatibles.

En Plugins selecciona **Nara IA Market → NaraFlows → Instalar**. Las cuatro skills y el MCP se instalan juntos. También puede instalarse con el CLI que soporte `codex plugin add naraflows@nara-ia-market`.

En un chat con el plugin activo pide conectar NaraFlows. En la pestaña del BPMN pulsa **Conectar con Codex** (sirve para cualquier asistente que ejecute este MCP, también Claude), pega el código temporal y pulsa **Vincular esta pestaña**. Autoriza el acceso local si el navegador lo solicita. Vincula desde Chrome o Edge de escritorio: el panel de navegador integrado de la app de escritorio de Claude bloquea la petición local de vinculación (`net::ERR_BLOCKED_BY_CLIENT`). El código vence en cinco minutos y solo se usa una vez. La misma pestaña recupera el vínculo al recargar mientras el MCP siga activo. Cerrar el host o reiniciar el MCP requiere volver a vincular. No se inicia un servicio permanente del sistema.

## Herramientas

| Herramienta | Función |
| --- | --- |
| `naraflows_connect` | Código y enlace de vinculación. |
| `naraflows_sessions` | Pestañas vinculadas a esta instancia. |
| `naraflows_read` | Revisión, hojas, elementos de la hoja activa, selección, guardado y XML completo opcional. |
| `naraflows_edit` | Una operación nativa con revisión obligatoria y deshacer; incluye crear, renombrar, abrir y vincular hojas. |
| `naraflows_validate` | Auditoría semántica y geométrica de la hoja activa, con IDs, revisión y cobertura. |
| `naraflows_edit_batch` | Hasta 200 operaciones BPMN compatibles, prevalidación en copia, aliases y un deshacer conjunto. |
| `naraflows_save` | Guardado en el archivo autorizado, historial y comprobación. |
| `naraflows_export_png` | Hoja activa completa para el chat y archivo PNG temporal para Word/PDF. |
| `naraflows_export_bpmn` | XML completo (todas las hojas) en un archivo .bpmn temporal con hash y revisión, sin enviarlo al chat. No guarda el archivo del usuario. |
| `naraflows_disconnect` | Revocar una pestaña sin perder su trabajo. |
| `naraflows_microsoft_status` | Cuenta/tenant, documento, destino y recibos por requestId. |
| `naraflows_microsoft_resolve` | Resolver enlace o IDs Microsoft sin cambiar identidad ni permisos. |
| `naraflows_microsoft_list` | Bibliotecas o carpetas/BPMN dentro del alcance explícito. |
| `naraflows_microsoft_create` | Crear sin sobrescribir, verificar y asociar el documento actual. |
| `naraflows_microsoft_open` | Abrir un BPMN remoto conservando cambios y borradores. |
| `naraflows_microsoft_attach` | Asociar bytes idénticos sin importar ni sobrescribir. |
| `naraflows_microsoft_autosave` | Activar/pausar el programador y comprobar su destino exacto. |

El puente escucha únicamente en `127.0.0.1`, en un puerto asignado al arrancar. Solo acepta el origen de la web publicada, exige un código aleatorio de un solo uso y autentica cada sesión. No permite ejecución de JavaScript arbitrario ni acceso general al disco. Los comandos que no reciben confirmación no se repiten automáticamente.

El puente es local; los datos consultados mediante MCP se entregan a la conversación del asistente. La web no publica los BPMN en GitHub. El historial de archivos locales está en el navegador, no en el market. Los documentos abiertos con **Conectar Microsoft** se guardan mediante la autorización de esa cuenta y no se conservan en el Historial local. La conexión Microsoft y el vínculo con Codex son independientes. El puente por sí solo no habilita uso móvil ni control de otros equipos.

Un archivo puede tener procesos independientes y detalles de subprocesos en planos BPMN nativos. `sheet_link` usa una actividad de llamada para reutilizar otra hoja y protege subprocesos que ya tienen contenido. La navegación cambia la revisión; guardar conserva todas las hojas.

La versión 0.4.0 añade hojas ER con tablas, campos, PK/FK, nulabilidad y relaciones por campo con cardinalidad. Se conservan dentro del mismo BPMN mediante una extensión Nara versionada, sin convertir tablas en tareas. `read` identifica `diagramType` y devuelve `dataModel` en ER. `edit` incorpora `erd_sheet_create`, `erd_table_create/update`, `erd_field_upsert/delete`, `erd_relationship_create/update` y `erd_delete`, además de `lane_add`, `lane_split`, etapas relativas y `view` para ampliar/restaurar el lienzo.

El MCP opera con revisión y deshacer en ambos modelos. Las tablas ER usan x/y de esquina superior izquierda, mientras `create` BPMN usa centro. El alto de tabla se deriva de sus campos. Eliminar un campo o tabla elimina sus relaciones; crear una relación marca FK en el campo de destino. No se ejecuta SQL ni se modifican bases de datos.

El PNG tiene fondo blanco y escala ajustable (2 por defecto); se limita a 8192 píxeles por lado, 16 megapíxeles y 8 MB. Incluye toda la hoja activa, sin barras ni paneles del editor. El MCP devuelve un bloque de imagen para que el asistente pueda verlo y un `filePath` con hash, revisión, `sheetId` y `sheetName`. Ese archivo se crea en la carpeta temporal del sistema bajo `NaraFlows/exports`, con nombre único; el chat puede copiarlo a la ubicación del informe. Exportar PNG no guarda el BPMN ni acredita validación del proceso.

## Construcción

Desde la raíz del repositorio: `npm ci`, `npm run build`, `npm test`. El paquete instalable es esta carpeta completa; no incluir `node_modules`, `local/`, fuentes de clientes ni códigos de vinculación. Las licencias del servidor se conservan en `server/dist/THIRD_PARTY_NOTICES.txt`.

La edición manual de tablas se realiza por celdas en el lienzo (Enter aplica, Escape cancela, Tab avanza). El panel derecho ofrece formato y posición/tamaño. `style` aplica colores, grosor y texto; `erd_field_move` reordena campos por ID; `stage_split` divide una etapa en dos o tres columnas. La nulabilidad se conserva y es editable mediante `erd_field_upsert`. Las nuevas hojas empiezan vacías.

## Semántica, auditoría y bloques

`read` devuelve `editorVersion`, `editorBuild`, `capabilities`, nombres internos de enlaces, referencias y expresiones de eventos, condiciones, salidas predeterminadas y límites reales de etiquetas externas. `includePropertyFields:true` añade los campos admitidos y sus opciones; `elementIds` filtra una lectura puntual y no sirve para una auditoría integral. `edit` con `properties` utiliza el mismo servicio de validación que la interfaz manual. Los tipos adicionales de eventos se eligen con `create.eventDefinition`; las propiedades posteriores completan su configuración.

`validate` no edita: el perfil `review` informa las condiciones formales pendientes como avisos; `formal` las exige en las ramas aplicables. Detecta pares de enlaces por proceso/subproceso, referencias de flujos, condiciones, temporizadores, cruces, contactos, líneas sobre figuras y superposición de etiquetas. Devuelve `source`, `coverage`, `complete`, errores y avisos. Una lectura parcial o sin geometría suficiente no acredita revisión integral. No certifica ejecución ni aprobación de negocio.

`edit_batch` admite hasta 200 operaciones y un coste estructural de 500. Agrupa creación, conexiones, documentación, condiciones, bucles, eventos, geometría y propiedades; añade matriz, limpieza de hoja y carriles nativos. Un subproceso puede crearse con `expanded:true`, dimensionarse y recibir sus actividades internas por alias en ese mismo bloque. `dryRun:true` prueba sobre una copia nativa sin modificar el lienzo. Los alias `as` se usan como `@alias` en operaciones posteriores, también para referenciar conexiones en condiciones y salidas predeterminadas. Una revisión modificada durante la prevalidación impide aplicar. Cada bloque confirmado se deshace o rehace una sola vez. Hojas, etapas individuales y operaciones ER siguen separadas.

Cada bloque exige `requestId`. Repetir el mismo ID, contenido y revisión recupera el resultado conservado, sin duplicarlo; reutilizarlo con otro contenido se rechaza. La caché conserva los últimos 64 bloques en memoria de esa pestaña y se pierde al recargar. Ante resultado incierto, lee y compara antes de reintentar. Si falla una operación inesperadamente, el editor intenta restaurar y verificar el XML previo; si no puede confirmarlo, conserva la copia y bloquea nuevas mutaciones con `BATCH_RECOVERY_REQUIRED`. No sobrescribe una edición manual posterior para recuperar una confirmación.

Para analizar copias locales sin conexión: `node <plugin>/shared/snapshot-cli.mjs validate <snapshot.json> [--formal]`, `diff <before.json> <after.json>` o `plan <snapshot.json> <operations.json>`. Solo leen archivos y devuelven JSON; no son otro MCP. El plan elimina únicamente operaciones redundantes demostrables.

Al actualizar, abre un chat nuevo con el plugin para cargar las nueve herramientas y carga la web actualizada después de conservar cualquier trabajo pendiente. Un chat o pestaña que mantenga una versión anterior debe informar sus capacidades reales; la instalación sola no demuestra conexión.

## Calidad de edición visual

La web 0.9.0 permite redimensionar Task y CallActivity, ajustar texto a 16 px con espacio para iconos y marcadores, rutas ortogonales locales con anclajes persistentes, formato/borrado en bloques y compactar margen vacío de participantes. Formato/uso documental se conserva como DataState nativo; los rombos se pueden seleccionar dentro de etapas. Las notas aceptan fondos de color. La respuesta normalizada y las skills separan calidad visual, validez BPMN y aprobación del negocio. Véase [contrato visual](shared/visual-editing.md).

## Proyectos en paralelo

Cada pestaña conserva su documento y cuenta. Usa una vinculación distinta por proyecto; identifica `sessionId`, archivo y `documentId` al leer. Envía `expectedDocumentId` junto con `expectedRevision` al editar/guardar. Si se omite, el puente utiliza el documento de la última lectura confirmada; no sustituye el destino por el de una pestaña nueva. Ante `DOCUMENT_MISMATCH` vuelve a identificar el documento y conserva el trabajo. Un archivo abierto en consulta por otra pestaña rechaza ediciones con `FILE_READ_ONLY`; pide transferir su edición mediante **Editar aquí**, sin forzarla ni desconectar la sesión original.

## Archivos Microsoft mediante MCP

La extensión microsoft-files-v1 añade siete herramientas para estado, resolución de enlaces/IDs, listado acotado, creación sin sobrescritura, apertura protegida, asociación de bytes idénticos y configuración verificable del autoguardado. Reutiliza la cuenta y los permisos del editor; el puente no obtiene tokens. El [contrato operativo](shared/microsoft-files.md) describe argumentos, consentimiento y recuperación. Las referencias son temporales y los recibos viven en memoria; no se promete idempotencia durable tras recargar. Una escritura sin confirmar se consulta antes de repetir. La capacidad nueva requiere la web y el servidor compatibles; instalar un paquete no recarga otro chat.

Para elegir una distribución amplia, las skills consultan [composición del proceso](shared/composition.md): ancho útil, equilibrio ancho/alto/área, filas alternadas como alternativa y anclajes según el orden espacial. El [ejemplo ficticio antes/después y su evaluación local](shared/examples/compact-rows/README.md) conserva nueve actividades de 260×100 y la lógica, sin conexión a un cliente. Las ilustraciones y snapshots no acreditan ejecución MCP ni texto renderizado del editor. Esta documentación fuente no cambia por sí sola el runtime instalado.
