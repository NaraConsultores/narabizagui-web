# Ejemplo genérico: secuencia escalonada y filas alternadas

Este proceso ficticio se creó desde cero para practicar las [decisiones de composición](../../composition.md). No es una copia ni una reconstrucción de un proceso de cliente. Los nombres, responsabilidades y documentos son didácticos. No se conectó un visor para producir estos archivos.

| Archivo | Uso |
| --- | --- |
| [before.bpmn](before.bpmn) / [after.bpmn](after.bpmn) | Dos versiones editables del mismo proceso genérico con BPMN DI. Abrir solo en una sesión de prueba aislada sin destino de guardado. |
| [before.json](before.json) / [after.json](after.json) | Snapshots sintéticos para comparar IDs, lógica y geometría; no son lecturas del editor. |
| [before.svg](before.svg) / [after.svg](after.svg) | Ilustraciones esquemáticas calculadas desde los snapshots. No son exportaciones del editor ni pruebas de sus tipografías/iconos. |
| [evaluate.mjs](evaluate.mjs) | Evaluación local de solo lectura con las utilidades compartidas del plugin. No necesita sesión MCP ni modifica archivos. |
| [evaluation.json](evaluation.json) | Resultado reproducible del ejemplo: invariantes, métricas, diff y límites de cobertura. |

El flujo es Inicio → nueve actividades → Fin. Recepción tiene dos actividades; Análisis, dos; Registro, cinco. Se reutiliza Solicitud entre dos actividades y Registro guardado entre escritura y verificación. Consultar catálogo no escribe; Seleccionar alternativa produce datos temporales; Registrar resultado persiste el registro. La documentación de las actividades y datos conserva esas distinciones en ambas versiones. No hay decisiones en este ejemplo; no acredita preservación de condiciones/ramas de otro proceso.

| Medida del participante | Antes | Después | Cambio |
| --- | ---: | ---: | ---: |
| Ancho | 1900 | 906 | −52.3 % |
| Alto | 960 | 1280 | +33.3 % |
| Área | 1824000 | 1159680 | −36.4 % |
| Ancho / alto | 1.979 | 0.708 | Más vertical |
| Actividades | 9 de 260×100 | 9 de 260×100 | Sin reducción |

Después hay dos columnas alineadas, lectura alternada y tres filas para Registro, conservando un proceso y sus tres responsables. `Flow_4` sigue siendo `Task_3 → Task_4`, aunque ahora va de derecha a izquierda. Su anclaje pasa de salida derecha/entrada izquierda a salida izquierda/entrada derecha; no se invierte la lógica. El paso entre Análisis y Registro usa un anclaje inferior desplazado para dejar sitio al dato temporal. No se añaden etapas, leyendas ni pendientes.

## Reproducir la evaluación

Desde esta carpeta:

```text
node evaluate.mjs
```

También acepta dos rutas de snapshots con el mismo esquema. Código de salida 0: cumple las invariantes y criterios estáticos de **este ejemplo**; 2: alguna comprobación falla; 1: error de lectura/esquema. El SHA-256 semántico excluye únicamente posición, dimensiones, recorridos, anclajes y límites de etiquetas. Las dimensiones de tareas se comprueban aparte. Incluye todos los demás campos de los elementos, por lo que un cambio de responsable, texto, tipo, documentación, asociación o extremo rompe la igualdad. El diff debe mostrar solo geometría prevista, sin IDs añadidos ni eliminados.

La auditoría estática de ambas versiones tiene cero errores, avisos y hallazgos de rutas. `quality.complete:false` conserva las nueve actividades en `missingRenderedText`: faltan los límites del texto SVG del editor. Esa cobertura no se inventa. Las ilustraciones permiten examinar el plan, pero no prueban el resultado de una operación MCP, deshacer, guardado ni aprobación funcional.

## Evaluar el uso de la skill

Casos para aplicar las instrucciones, con respuesta observable y límite explícito. Esta tabla es una evaluación de escritorio y una guía de aceptación; no representa ejecuciones MCP realizadas.

| Solicitud / condición | Decisión esperada | Evidencia / rechazo |
| --- | --- | --- |
| Compactar un proceso ancho con tamaños acordados | Leer conjunto una vez, comparar ancho/alto/área y ancho útil; evaluar filas antes de mover | Conservar tamaños e IDs. No usar `clear`/`matrix` para reconstruirlo. |
| La actividad siguiente queda a la izquierda | Planear salida izquierda/entrada derecha si el corredor está libre | Conservar origen/destino de la conexión; no heredar los lados antiguos. |
| Un anclaje manual tiene intención clara | Conservarlo y planear el corredor alrededor | Cambiarlo solo dentro del alcance autorizado; no recalcular rutas ajenas. |
| Un responsable concentra cinco actividades | Varias filas en su mismo carril si mejoran lectura | No inventar otro actor, etapa ni segundo flujo. |
| Un proceso con ramas queda más claro horizontal | Conservar o ajustar esa composición según el formato de uso | Dos columnas y menor área no son condiciones universales de aprobación. |
| Hay compuerta, condición y salida predeterminada | Comparar IDs, extremos, condiciones y default antes/después | El ejemplo lineal no cubre este caso; exigir evidencia específica del proceso autorizado. |
| Un libro real se usa en hasta cinco actividades | Reutilizar el objeto con asociaciones legibles y documentos próximos | No duplicarlo para cada paso; si no caben sin cruces, replantear corredores. |
| Una consulta devuelve una selección | Mantenerla como dato temporal si ayuda; comprobar qué actividad escribe | No atribuir persistencia por usar `Salida` o un icono de datos. |
| El esquema no incluye una operación necesaria | Verificar capacidad y registrar dependencia concreta | Usar solo alternativa admitida (`route` planificado, por ejemplo); no simular ni eludir mediante UI/JS. |
| Mover una tarea produce un rodeo o cambia un anclaje inesperadamente | Conservar revisión/IDs/ruta y registrar incidencia genérica de producto | No reconstruir todo ni tantear coordenadas sucesivas. |
| Auditoría informa cero errores BPMN | Revisar composición, rutas y texto por separado | No declarar calidad visual, guardado ni aceptación de negocio por ese dato. |
| El usuario solo pide exportar | Reutilizar revisión confirmada y una imagen comprobada | No remodelar ni dividir la hoja para que quepa. |

En una evaluación futura de editor autorizada, aplicar solo a una pestaña genérica nueva y sin archivo asociado: una lectura suficiente, plan proporcional, bloque compatible y revisión incremental, una confirmación visual. Registrar capacidades/build, revisión, IDs, llamadas y reintentos. Una limitación de texto, un runtime antiguo o un fallo del producto se informa sin abrir un proceso de cliente para completar la prueba.
