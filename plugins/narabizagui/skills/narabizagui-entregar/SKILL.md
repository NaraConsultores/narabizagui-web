---
name: narabizagui-entregar
description: Conservar una versión editable de NaraBizagui, comprobar el guardado y exportar PNG para chat, Word o PDF con trazabilidad de revisión y hoja. No requiere remodelar el proceso.
---

# Conservar y entregar

Lee [el contrato común](../../shared/workflow.md). Identifica la hoja y revisión solicitadas; no vuelvas a construir o validar todo el proceso para una exportación sencilla. Si existen hallazgos relevantes de la revisión, consérvalos como límites de la entrega.

Una solicitud de ver el cambio en el editor se confirma allí; no activa por sí sola una exportación para informe. Reutiliza el estado confirmado del bloque o una lectura resumida vigente para exportar. Una sola imagen comprobada basta; no añadas además una captura equivalente ni guardados manuales si el destino/autoguardado ya están autorizados.

Para guardar sobre el destino actual usa `narabizagui_save` con el archivo autorizado. Para elegir, crear o abrir un destino Microsoft explícitamente solicitado usa [microsoft-files-v1](../../shared/microsoft-files.md) si la capacidad está disponible. Un destino local o una autenticación pendiente pueden requerir un paso específico del usuario en el editor; no simules selectores ni inventes rutas. Informa guardado con `saved:true` y hash comprobado, o creación con `created:true`, `verified:true` e identificadores exactos; `attached` confirma por separado la asociación. Conectar Microsoft y conectar el MCP son autorizaciones distintas.

Cuando esté autorizado conservar una copia local del XML, usa `narabizagui_export_bpmn` con `expectedRevision`: escribe todas las hojas en un `.bpmn` temporal y devuelve `filePath`, `bytes`, `sha256`, revisión y hojas sin enviar el XML al chat. Copia ese archivo al proyecto o destino acordado y verifica su hash. Si el esquema cargado no expone esa herramienta, guarda el contenido exacto de `read(includeXml:true)` y verifica su hash, sabiendo que el XML completo entra en la conversación. Identifícala como copia exportada: no acredita guardado nativo ni permite cerrar un lienzo con cambios pendientes por inferencia.

Exporta con `narabizagui_export_png` sobre la revisión actual y confirma `sheetId`, `sheetName`, dimensiones, hash y `effectiveScale`. Revisa la imagen devuelta. El `filePath` es temporal; copia el PNG a la carpeta de entrega si se utilizará en un informe. Conserva el BPMN editable y la revisión de origen junto con la imagen derivada. Exportar no modifica ni guarda el BPMN.

Un archivo puede contener varias hojas; el PNG incluye únicamente la activa. Exporta las solicitadas, leyendo de nuevo al cambiar de hoja. No inventes recortes por etapas ni reorganices un diagrama grande para conseguir una imagen. Si un informe requiere paginación, propón el formato respetando la preferencia del usuario.

Entrega enlaces utilizables a los archivos, qué se comprobó y cualquier limitación material. No presentes XML válido, una imagen o un guardado como aprobación funcional o de negocio.

Si el encuadre o la escala impiden leer la entrega, informa el límite y remite una reorganización solicitada a modelado con los criterios de [composición](../../shared/composition.md). Exportar no autoriza cambiar tamaños, rutas ni separar en dos flujos una hoja. Consulta [edición visual y calidad](../../shared/visual-editing.md) solo para interpretar hallazgos existentes.

Para gestionar una ubicación OneDrive/SharePoint expresamente solicitada, lee [el contrato de archivos Microsoft](../../shared/microsoft-files.md) y comprueba microsoft-files-v1. Una revisión sin cambios sigue siendo de solo lectura: no abre, crea, guarda ni activa autoguardado por inferencia.
