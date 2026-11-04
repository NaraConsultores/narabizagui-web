# NaraFlows

## Punto de entrada

Leer `local/RESUMEN_CONSTRUCCION.md` y `local/estado_proyecto.json` para retomar el estado de esta instalación. Los archivos bajo `local/` son privados del equipo y están excluidos de Git. No cargarlos en la web ni publicarlos.

## Alcance

Este proyecto contiene la herramienta BPMN reutilizable, su experiencia de edición, alojamiento, integraciones y pruebas. La validación de procesos de clientes pertenece a sus proyectos respectivos. No cargar transcripciones, Excel, BPMN reales ni contexto de clientes para desarrollar la herramienta, salvo instrucción específica y con copia de prueba.

## Trabajo

- Fuente canónica de la web: repositorio público `NaraConsultores/naraflows-web`, rama `main`; archivos raíz, `assets/` y `vendor/`. Toda mejora futura de la web debe partir de este repositorio y publicarse allí.
- Plugin canónico de distribución: repositorio privado `NaraConsultores/naraflows`. Catálogo privado `NaraConsultores/plugins-nara`. Para mejorar el plugin, trabajar desde ese repositorio, validar y actualizar su commit en el catálogo; no volver a publicar desde fuentes personales ni mezclar instrucciones privadas con la distribución pública de la web.
- Sitio de producción: `https://demo.naraconsultores.com/NaraFlows/`. Conservar el mismo origen, la ruta anterior `/NaraBizagui/` y su retorno Microsoft/Entra para compatibilidad. Mantener las claves de almacenamiento y bloqueos existentes. `NaraConsultores/NaraConsultores.github.io` publica las demos; no es la fuente de desarrollo de NaraFlows y contiene otros proyectos que no se deben modificar al publicar este editor.
- Publicar los recursos web validados con `node scripts/publish-web.mjs --target <checkout de NaraConsultores/NaraConsultores.github.io>`. Revisar y confirmar solo las carpetas `NaraFlows/` y `NaraBizagui/` de este editor de ese checkout, subir `main` y verificar el manifest y sus hashes desde la URL pública. El exportador omite skills, MCP, pruebas, archivos locales e historial.
- Los procesos se guardan como BPMN independientes. Un cambio de proceso no crea otro visor ni requiere publicar la herramienta.
- Preservar IDs, asociaciones, documentación y geometría de elementos no afectados. Separar mejora de interfaz, prueba técnica y validación del proceso.
- No incluir fuentes de clientes, credenciales, configuración del equipo, historiales privados o capturas con datos reales en un commit público. Inspeccionar archivos preparados antes de publicar.
- Conservar las licencias y atribución de dependencias. La licencia local de bpmn-js exige mantener visible su distintivo.
- El plugin `plugins/naraflows/` contiene la skill y el MCP local con puente explícito a una pestaña. La mera instalación o presencia de otros MCP BPMN no demuestra conexión: comprobar sesión, revisión y confirmación del visor. La conexión directa a Microsoft requiere además la cuenta autorizada en el visor; no equivale al vínculo MCP.
- El PNG del MCP es una imagen derivada y un archivo temporal para informes; no equivale a guardado del BPMN ni a validación del proceso. Preservar el archivo editable y la revisión de origen.
- Probar con temporales o ejemplos genéricos. Verificar el sitio renderizado y los recursos de la versión publicada cuando se modifique la web. Actualizar hashes de `manifest.json` si cambian recursos distribuidos.

## Contexto separado

Toda mejora adicional del modelador se trabaja aquí. Cada proyecto de cliente conserva su BPMN, fuentes, estado de revisión y enlaces a la herramienta; no requiere cargar la historia de construcción de esta aplicación.
