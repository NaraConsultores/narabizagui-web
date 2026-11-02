# Operaciones y propiedades

## Construcción y geometría

`create.x/y` son el centro de una figura BPMN; `move.dx/dy` son desplazamientos. `resize` usa esquina y dimensiones. Las tablas ER usan esquina superior izquierda y su altura deriva de los campos.

Usa `lane_split`/`lane_add` para responsables internos, `stage` para columnas y `move_elements` para transferencias conjuntas conservando conexiones. Las etapas no modifican la lógica. Las conexiones se corrigen con `route` y las etiquetas externas con `label.bounds`; utiliza los límites realmente devueltos por `read`, pues el texto ajusta su altura.

Una fila visual no es una etapa ni un carril nuevo. Para reorganizar conserva IDs y asignaciones; evalúa [composición](composition.md) antes de mover y enruta según el nuevo orden espacial. `matrix` construye un conjunto nuevo; no reemplaces un proceso existente para compactarlo.

`read` devuelve solo la hoja activa; `includeXml` contiene el archivo completo (puede superar cientos de miles de caracteres): para conservar una copia usa `narabizagui_export_bpmn`, que escribe el XML en un archivo temporal y devuelve ruta, bytes, `sha256`, revisión y hojas sin enviar el XML al chat. `sheet_create/open/rename`, `subprocess_open` y `sheet_link` conservan planos nativos. Vincular una hoja usa `CallActivity.calledElement`, requiere un subproceso vacío y no permite autorreferencia. No reemplaces contenido para resolver falta de capacidad.

Las operaciones de hoja no se agrupan en `edit_batch`. Envíalas con `narabizagui_edit` y `response:"summary"`: devuelve `applied`, `affectedId`, revisión, hoja activa y lista de hojas (`id`, `name`, `processId`) sin figuras ni XML. La respuesta completa (predeterminada por compatibilidad) repite el snapshot entero de la hoja, unos 70 000 caracteres en una hoja mediana, en cada llamada. Comprueba `capabilities.editSummary` antes de confiar en el resumen.

### Geometría de `matrix`

La matriz coloca el participante en `x`, `y` (predeterminados 100 y 140) con alto `número de carriles × rowHeight` (predeterminado 180; 140 a 600). `width` predeterminado es `max(1080, etapas × 300 + 60)` y debe ser al menos `etapas × 220 + 60`. Los primeros 60 px son el encabezado del participante y los carriles; las etapas ocupan el resto:

- ancho de etapa = (`width` − 60) / número de etapas; la etapa 1 empieza en `x` + 60 y la etapa j en `x` + 60 + (j − 1) × ancho de etapa;
- centro de la etapa j = `x` + 60 + ancho de etapa × (j − 0,5); centro del carril k = `y` + `rowHeight` × (k − 0,5);
- centro de una figura = centro de su celda + (`xOffset`, `yOffset`);
- cada figura debe quedar al menos 12 px dentro de los bordes laterales de su etapa y 16 px dentro de su carril, con 8 px entre figuras de la misma celda; si no, el bloque se rechaza indicando la clave y `cell`.

Ejemplo genérico: `x:100, y:140, width:1260, rowHeight:200`, tres etapas y dos carriles. Ancho de etapa = 1200 / 3 = 400; etapas en x 160, 560 y 960, con centros 360, 760 y 1160; centros de carril en y 240 y 440. Una actividad de 220×100 en el carril 1, etapa 1, queda centrada en (360, 240): esquina (250, 190). En cada celda caben actividades de hasta 376×168.

Las actividades se crean de 100×80 si no indicas tamaño. Con editor 0.11.5 o posterior (`capabilities.matrixActivitySize`) usa `activitySize:{width:220,height:100}` para todas las actividades de la matriz o `width`/`height` por figura (20 a 1000); eventos y compuertas conservan su tamaño nativo y rechazan esos campos. Con un editor anterior añade en el mismo bloque un `resize` por actividad, calculado con las fórmulas: `{"type":"resize","elementId":"@revisar","x":250,"y":190,"width":220,"height":100}`. Un tamaño mayor exige que la celda lo admita; aumenta `width` o `rowHeight` en lugar de reducir el texto.

Las conexiones de `links` aceptan `as` y `label` opcionales (`capabilities.matrixLinkLabels`): `{"from":"completo","to":"cerrar","as":"si","label":"Sí"}` nombra la rama y devuelve su ID en `aliases.si`, utilizable después en `values.defaultFlow` o `condition:@si`. La etiqueta Sí/No no sustituye una condición formal.

La operación `matrix` no admite `as`: ya devuelve `pool`, `lane1…`, `stage1…`, las claves de sus figuras y el `as` de sus conexiones. Declarar `as` en la operación o reutilizar uno de esos nombres en otra operación produce «Alias inválido o repetido» (editor ≤ 0.11.4) o un mensaje que nombra el alias (0.11.5+). Usa otra clave.

En ER utiliza `erd_sheet_create`, `erd_table_create/update`, `erd_field_upsert/delete/move`, `erd_relationship_create/update` y `erd_delete`. Conserva tipo, PK/FK y nulabilidad al actualizar. Eliminar una tabla/campo también elimina relaciones; evalúa ese impacto. `style` conserva formato. No introduzcas ER en bloques BPMN.

## Propiedades semánticas

`read` expone `semanticProperties`, `eventDefinitions`, `condition`, `defaultFlowId`, `flowScopeId` y `labelBounds`. Para las opciones precisas lee `includePropertyFields:true` con `elementIds` del elemento. Una lectura filtrada no sirve como validación integral.

Aplica `operation:{type:"properties",elementId:"ID",values:{...}}`; solo se aceptan las claves y tipos admitidos para ese elemento. Reutiliza la configuración de la interfaz. Ejemplos de claves:

- Enlaces: `linkName`. Un nombre por ámbito (proceso/subproceso), una entrada y una o varias salidas. Se permiten extremos incompletos durante construcción, pero deben quedar identificados al validar. La etiqueta visible es independiente.
- Decisiones/actividades con salidas: `defaultFlow` contiene el ID de una conexión saliente; `condition:ID_CONEXION` contiene su expresión. Al seleccionar una predeterminada se elimina su condición. La conexión puede editarse directamente con `isDefault`, `flowCondition`, `flowLanguage`.
- Temporizador: `timerKind` (`timeDate`, `timeDuration`, `timeCycle`) y `timerValue`. Condicional: `eventCondition`, `eventLanguage`.
- Mensaje/señal/error/escalación: `referenceId` reutiliza una definición existente; con ID vacío, `referenceName` crea una y `referenceCode` permite código para error/escalación. No renombres referencias compartidas por inferencia.
- Actividades: `loopMode` (`none`, `standard`, `sequential`, `parallel`), `loopCondition`, `loopCardinality`. Borde: `interrupting`. Objetos de datos: `isCollection`.

`create` admite `eventDefinition` (por ejemplo `Timer`, `Message`, `Signal`, `Conditional`, `Link`) según el tipo de evento, además de `linkName` para enlaces. Configura después sus propiedades. No ejecuta expresiones ni certifica compatibilidad con un motor.

## Bloques y alias

El contrato `coordination-v1` añade `presentation:{expandedCanvas:true}` al bloque y `response:"summary"` (predeterminado en el MCP). `fit:true` encaja después de cambiar la vista. La respuesta compacta conserva revisión, hash, alias, incidencias y estado de guardado; omite figuras/XML. Usa `response:"full"` cuando necesites la geometría completa o `previewElements` de un rechazo. El formato de respuesta puede cambiar en un reenvío del mismo bloque; cambiar operaciones o presentación con el mismo identificador se rechaza. Un `dryRun` nunca presenta ni encaja la vista.

`timings` separa preparación, lectura, prevalidación, aplicación, presentación, confirmación y transporte. `firstVisibleMs` abarca desde la entrada al bloque en el editor hasta un cuadro visible confirmado; no incluye el tiempo de razonamiento, voz o coordinación anterior. Si la pestaña está oculta, vence la espera de cuadro o falla la presentación, `presentation.paintConfirmed` es falso y no se informa `firstVisibleMs`. La presentación se espera como máximo 250 ms y nunca revierte un modelo confirmado por un problema de vista.

`narabizagui_edit_batch` admite hasta 200 operaciones de `capabilities.batchOperations`, exclusivamente BPMN, con un coste estructural máximo de 500. Permite procesos completos con actividades, decisiones, eventos, condiciones, bucles, documentación, geometría y enlaces. Añade `matrix` para participante/carriles/etapas y `clear` con `scope:"active"` para limpiar esa hoja. `lane_split/lane_add` se agrupan también. Los cambios de archivo, hojas y ER siguen separados; las mutaciones no se paralelizan ni se ejecutan una por una cuando pueden agruparse.

La matriz devuelve alias `pool`, `lane1…`, `stage1…` y las claves de figuras. Un paso posterior usa `parentId:"@lane2"` para asignación nativa de responsable. Un `create` de `bpmn:SubProcess` acepta `expanded:true`; puedes redimensionarlo y crear sus figuras internas con su alias dentro del mismo bloque. Las conexiones internas deben permanecer en su ámbito BPMN. El MCP recibe el plan entero, lo prevalida, aplica y devuelve IDs, revisión, validación y duración. `fit:true` encaja el conjunto sin una llamada de navegador.

Para una geometría ya dimensionada, `create` y `resize` aceptan `autoResize:false`: conserva los contenedores previstos y exige que las figuras creadas quepan en su padre. El comportamiento nativo de ampliación automática se conserva si se omite. `requireValid:true` rechaza el bloque cuando la auditoría de la copia contiene errores, sin cambiar el lienzo; devuelve incidencias y `previewElements` para corregir la disposición. `dryRun` también devuelve esa geometría. Los IDs de la copia no son IDs del documento real.

`clear` + `matrix` + operaciones sobre `@alias` permiten reemplazar solo el contenido autorizado de la hoja en un Deshacer. La matriz es aditiva si no se limpia primero; `poolId` solo reutiliza un participante vacío.

**`clear` y la identidad de la hoja.** Con editor 0.11.4 o anterior, limpiar una hoja con participante elimina el último participante y bpmn-js convierte la colaboración en un proceso nuevo: la hoja pasa a llamarse, por ejemplo, «Proceso 15» y cambian los IDs de la colaboración y del proceso. Las actividades de llamada que apuntaban a esa hoja (`calledElement`) quedan sin destino. Desde el editor 0.11.5 (`capabilities.clearPreservesSheet`), `clear` conserva un participante expandido y vacío, de modo que la hoja mantiene nombre, ID de colaboración e ID de proceso, y la siguiente `matrix` sin `poolId` lo reutiliza. El resultado incluye `sheet:{id,name,processId,preserved}` y, si no pudo conservarse (por ejemplo, solo había participantes contraídos), `previous` con la identidad anterior. Si `preserved` es falso o el editor es anterior, renombra la hoja con `sheet_rename` y revisa con `sheet_link` cada CallActivity que la llamaba antes de continuar. La escritura no se fuerza al terminar: comprueba el estado de autoguardado de la respuesta o de una lectura resumida cuando sea necesario.

Un `create`/`connect` puede declarar `as:"revision"`; pasos siguientes referencian `@revision` en IDs. También sirven alias en `values.defaultFlow` y claves `condition:@flujo`. El resultado devuelve los IDs reales en `aliases`. Los IDs del `dryRun` pertenecen a la copia temporal; no los uses como IDs reales.

Ejemplo mínimo:

```json
[
  {"type":"create","as":"inicio","bpmnType":"bpmn:StartEvent","x":120,"y":160},
  {"type":"create","as":"tarea","bpmnType":"bpmn:UserTask","name":"Revisar","x":300,"y":160},
  {"type":"connect","sourceId":"@inicio","targetId":"@tarea"}
]
```

La prevalidación usa un modelador temporal con la hoja y extensiones del archivo; no sustituye al modelo vinculado. Un bloque correcto se aplica en un paso de deshacer. Si la prevalidación falla no cambia el original. Ante un fallo inesperado se intenta deshacer y se comprueba el hash anterior; el resultado distingue reversión verificada de recuperación pendiente. Comprueba siempre `applied`, `replayed`, `rolledBack` y `recoveryRequired`.

## Texto, rutas y edición localizada

Consulta [edición visual](visual-editing.md) para fit_text, route_orthogonal, compact_container, documentFormat/documentUse, formato agrupado y respuestas canónicas. Ninguna de estas operaciones requiere reconstruir el archivo.
