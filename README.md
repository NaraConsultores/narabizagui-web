# NaraBizagui by NaraLab

Editor de procesos BPMN en el navegador, con carriles por responsable, columnas de etapas, documentos y comentarios. Interfaz propia de NaraLab basada en bpmn-js.

## Abrir

Web: **https://demo.naraconsultores.com/NaraBizagui/**

Código y mejoras de la web: [NaraConsultores/narabizagui-web](https://github.com/NaraConsultores/narabizagui-web).

También puede ejecutarse el código localmente desde esta carpeta:

```sh
python -m http.server 8766 --bind 127.0.0.1
```

Abrir `http://127.0.0.1:8766/`. No hay servidor de documentos ni base de datos.

## Versión 0.11.4

- En pantallas táctiles, un dedo desplaza el diagrama y el pellizco con dos dedos lo amplía o reduce alrededor de los dedos, en lugar de ampliar toda la página. Los controles del lienzo mantienen su tamaño y los toques cortos siguen seleccionando.

## Versión 0.11.3

- Si el navegador no permite la ventana de inicio de sesión de Microsoft, el editor continúa automáticamente en la misma pestaña, sin preguntas ni avisos. Conserva el diagrama abierto, incluidos los cambios sin guardar, y al volver reabre el diálogo de Microsoft donde estaba.

## Versión 0.11.2

- Si el navegador bloquea la ventana de inicio de sesión de Microsoft (navegadores integrados o bloqueadores de ventanas emergentes), el editor ofrece continuar en la misma pestaña y vuelve a NaraBizagui al terminar. Solo lo permite cuando no hay cambios sin guardar ni texto de Propiedades pendiente.

## Versión 0.11.1

- Las rutas automáticas cruzan los separadores de carril perpendicularmente y reservan al menos 16 px para tramos paralelos y codos. Los recorridos manuales se conservan; `quality` informa `ROUTE_LANE_BORDER_CLEARANCE` y propone un recálculo local que mantiene los anclajes.

- Rutas adaptativas al mover actividades y recálculo local explícito, conservando los trazados manuales.
- Plugin 0.10.0 con criterios de composición proporcionada y ejemplos genéricos antes/después.
- Dieciséis herramientas MCP: las siete nuevas gestionan archivos Microsoft dentro de una cuenta y un destino expresamente autorizados. Crear no sobrescribe archivos existentes; las operaciones verifican documento, revisión, eTag y resultado.

## Archivos

- **Archivo → Nuevo archivo:** inicia un BPMN sin datos de cliente.
- **Archivo → Abrir:** reúne Equipo, OneDrive/SharePoint y recientes de Microsoft. En Edge/Chrome de escritorio se conserva acceso al archivo local autorizado.
- **Guardado automático:** conserva los cambios aplicados tras una pausa de unos dos segundos, en el archivo Microsoft abierto o en el archivo local autorizado. Un documento nuevo necesita primero un destino mediante **Guardar → Opciones** o las herramientas MCP `microsoft-files-v1` con una carpeta Microsoft explícita. El indicador permanece junto a Guardar y muestra cambios pendientes, guardando, guardado o conflicto; **Más → Preferencias** permite pausarlo. Espera a **Guardado** antes de cerrar.
- **Guardar:** permite guardar inmediatamente; **Guardar como** elige otro destino. El guardado automático local requiere permiso de escritura y File System Access (Edge/Chrome de escritorio). En navegadores que solo descargan copias se conserva la exportación manual.
- **Archivo → Exportar:** descarga una copia editable BPMN con todas las hojas o una imagen SVG/PNG de la hoja activa, conservando el destino del original.
- **Información del archivo:** reúne ubicación, estado, revisiones locales y consulta de versiones Microsoft del archivo abierto. El historial local permite descargar revisiones conservadas en este navegador; borrar datos del navegador elimina ese historial. La consulta Microsoft es de lectura y no restaura versiones.

## Espacio de trabajo

La barra compacta reúne **Archivo, Editar, Vista y Ayuda**. **Guardar** permanece en el encabezado con su destino resumido y estado. **Conexiones** separa la cuenta Microsoft del vínculo del agente con esta pestaña. **Más** reúne Preferencias y Actividad; esta última conserva hasta 60 avisos de la sesión en memoria, sin sustituir el historial del archivo.

Al ocultar la paleta aparece **Herramientas** al inicio de la barra para volver a abrirla; **Alt+T** también la recupera. El icono situado después del porcentaje de zoom amplía el lienzo. En la vista ampliada permanece abajo a la derecha junto al distintivo bpmn.io; púlsalo de nuevo o usa Escape para salir.

En la vista ampliada el encabezado se oculta y queda el logo azul con un 80 % de transparencia. Acerca el puntero al logo para mostrar los controles; al salir del encabezado se ocultan. El panel aparece sobre el lienzo sin desplazar el diagrama. También se puede acceder al logo con Tab; en pantallas táctiles se muestra al tocarlo y se oculta al tocar fuera.

**Todas las hojas** permite buscar, abrir y renombrar hojas por su nombre completo y tipo. **＋** elige entre proceso BPMN y modelo ER; las herramientas corresponden a la hoja activa. La paleta BPMN tiene categorías plegables y búsqueda. **Alt+T** enfoca la búsqueda de herramientas y **Alt+H** abre todas las hojas; los demás atajos se consultan en Ayuda.

Preferencias conserva cuadrícula, ajuste BPMN al arrastrar, autoguardado y estilo inicial de figuras BPMN en este navegador. Restablecer espacio de trabajo recupera esos valores y los paneles. Los estilos iniciales no modifican figuras existentes. El explorador Microsoft incorpora búsqueda sobre la lista cargada y hasta 12 carpetas favoritas por cuenta/organización; desconectar elimina sus referencias locales.

## Editar y organizar procesos

Al acercar el mouse a una figura aparecen cuatro flechas. Las opciones rápidas siguen el lado más cercano: pulsa para añadir un elemento, arrástralo para colocarlo libremente o haz doble clic para conectar con un elemento cercano de ese lado. Si no hay un destino BPMN permitido, se añade el elemento elegido. Las flechas permiten arrastrar una conexión a una figura existente. Al pasar sobre una línea aparecen opciones de trazado directo, en ángulo y de tipo BPMN. Las acciones adicionales están en **⋯**; las propiedades se abren cuando las solicitas.

**Etapa** se coloca desde la paleta, como Participante, con forma de columna; se puede mover, redimensionar y renombrar. La navegación de etapas queda debajo del lienzo. Los símbolos Excel, Word, Manual y Datos identifican elementos del modelo, sin abrir archivos externos.

Las pestañas inferiores representan hojas del mismo BPMN. **＋** crea una hoja del tipo elegido; doble clic en una pestaña cambia su nombre. Un subproceso contraído abre su detalle con doble clic. Para reutilizar otra hoja, selecciona un subproceso vacío y elige **Propiedades → Hoja de proceso reutilizable**; la selección se aplica inmediatamente. El modelo utiliza una actividad de llamada BPMN (`CallActivity.calledElement`); no reemplaza el contenido de un subproceso que ya tiene elementos. La flecha inferior vuelve a la hoja anterior.

Guardar conserva todas las hojas en un solo archivo BPMN 2.0, con sus planos y referencias. SVG y PNG exportan la hoja activa. Otros modeladores pueden presentar estos planos de manera distinta; las pestañas son la navegación de NaraBizagui.

### Propiedades BPMN desde la interfaz

Selecciona una figura o una conexión y abre **Propiedades**. Nombre, descripción y opciones del elemento se aplican automáticamente tras una pausa breve al escribir, o al confirmar un selector. Estilo, Texto y Organizar siguen la misma lógica. Cada edición aplicada utiliza los comandos nativos y admite Deshacer/Rehacer. La descripción y las opciones del elemento se pueden desplegar dentro del panel. **Cambiar tipo de elemento** abre las opciones nativas permitidas para esa figura.

- **Enlaces:** crea un evento **Intermedio**, elige **Enlace · salida (flecha rellena)** o **Enlace · entrada (flecha vacía)** y asigna el **Nombre interno del enlace**. La salida y la entrada usan el mismo nombre dentro del mismo proceso o subproceso. El nombre visible puede ser diferente. El panel indica si encuentra la contraparte y evita dos entradas con el mismo nombre en el mismo ámbito. Se pueden configurar los extremos por separado; el aviso permanece hasta completar el par. Conecta la actividad anterior a la salida y la entrada a la siguiente actividad.
- **Decisiones:** permite elegir el tipo de compuerta, configurar las condiciones de sus salidas y seleccionar una salida predeterminada. La predeterminada se toma si ninguna condición se cumple y no lleva condición propia. Las compuertas paralelas y por eventos muestran su comportamiento, sin ofrecer condiciones que no les corresponden. Una conexión seleccionada permite configurar su condición, lenguaje opcional y marca de salida predeterminada cuando su origen lo admite.
- **Eventos:** temporizadores por fecha, duración o repetición; condición y lenguaje para eventos condicionales; crear o reutilizar mensajes, señales, errores y escalaciones; código opcional al crear un error o escalación. Los eventos de borde permiten configurar si interrumpen la actividad.
- **Actividades y documentos:** una ejecución, bucle con condición o instancias secuenciales/paralelas; cantidad de instancias opcional y marca de colección en objetos de datos. Las opciones existentes de documentos y hojas de subprocesos se conservan.

Los campos se serializan como propiedades BPMN 2.0 y no requieren el MCP. Las condiciones y temporizadores deben utilizar las expresiones admitidas por el motor donde se ejecute el proceso; el editor conserva esas expresiones, no las ejecuta. Un valor inválido permanece pendiente con un aviso y pospone el guardado; corrígelo o pulsa Escape para cancelar ese borrador. La edición de celdas ER directamente sobre el lienzo sigue confirmándose con Enter y cancelándose con Escape.

También se pueden elegir archivos locales de carpetas sincronizadas por OneDrive. En ese caso, el cliente de sincronización gestiona su subida.

### Conexión directa a Microsoft

**Conectar Microsoft** permite autorizar una cuenta corporativa o personal mediante Microsoft Identity Platform. La aplicación utiliza MSAL y código de autorización con PKCE, sin secreto de cliente. **Abrir desde Microsoft** navega OneDrive; para SharePoint se introduce la dirección del sitio y se elige una biblioteca. **Guardar una copia en Microsoft** crea un BPMN con otro nombre. Después, **Guardar** y el guardado por MCP actualizan ese mismo archivo.

El registro de aplicación pertenece a Nara y admite otras organizaciones. Cada usuario autoriza su cuenta; las políticas de su organización pueden exigir aprobación administrativa. Los permisos delegados declarados son `User.Read`, `Files.ReadWrite.All` y `Sites.Read.All`. El acceso a archivos puede abarcar todos los archivos del usuario, incluida su eliminación por el alcance del permiso de Microsoft; la interfaz solo implementa lectura y guardado de BPMN. La lectura de sitios se solicita al elegir **SharePoint**, introducir el sitio y pulsar **Continuar**. No hay permisos de aplicación ni consentimiento administrativo global concedido por esta configuración.

La conexión se recuerda en este navegador mediante la caché `localStorage` administrada por MSAL. Al recargar o abrir otra pestaña, se recupera únicamente la cuenta elegida y se comprueba el acceso en silencio, sin abrir ventanas automáticamente. Si Microsoft exige interacción o no puede comprobar el acceso, se ofrece conectar de nuevo. La persistencia después de cerrar todo el navegador depende de **Mantener la sesión iniciada** de Microsoft y de las políticas de la organización. [Documentación de la caché de MSAL](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/caching).

Se recuerdan por cuenta y organización la última carpeta visitada, el último BPMN abierto o guardado y hasta 12 archivos recientes. Solo se conservan nombres e identificadores, sin XML ni enlaces de descarga. Al volver a entrar con la cuenta conectada, el editor vacío relee el último BPMN desde Microsoft y lo abre con su revisión actual; no sustituye un archivo abierto, cambios, texto pendiente en Propiedades, una elección manual o un proyecto local. Si el archivo fue eliminado o perdió permisos, se informa y se puede elegir otro. **Recientes** abre cada archivo con un clic, comprobando acceso; **Limpiar recientes** borra la lista y la referencia que se retoma automáticamente. El navegador de carpetas recupera su ruta actual desde Microsoft.

**Cuenta → Desconectar** elimina la cuenta activa, su caché de acceso y sus referencias de carpetas/archivos de esta aplicación, avisa a sus otras pestañas y conserva el diagrama abierto como copia sin guardar. No cierra Microsoft 365. Cambiar de cuenta en otra pestaña invalida el vínculo anterior al archivo; no lo abre ni lo guarda con otra identidad. Las copias de documentos permanecen en memoria y los guardados en Microsoft omiten el Historial local persistente. **Los cambios sin guardar no se recuperan**: espera a que el indicador muestre **Guardado** antes de cerrar o recargar. Conectar con Codex sigue siendo una autorización separada y permite entregar el modelo al chat vinculado.

El guardado envía la revisión `eTag` como `If-Match`, rechaza conflictos y relee el contenido antes de mostrar **Guardado**. Los fallos de confirmación detienen el autoguardado hasta recargar; no se repite una escritura incierta. En archivos locales se comprueba el contenido anterior, se usa un escritor exclusivo y se coordinan las pestañas de este origen mediante Web Locks. Otras aplicaciones y equipos sincronizados dependen también de sus mecanismos de bloqueo y sincronización.

### Sincronización y combinación automática

Con el mismo archivo abierto, la pestaña visible comprueba su versión Microsoft aproximadamente cada 15 segundos. Si la versión sigue igual, consulta únicamente metadatos: no descarga, analiza ni vuelve a importar el BPMN. Las consultas no se solapan y se pausan con la pestaña oculta; ante errores se espacian y se respeta `Retry-After` de Microsoft. La actualización conserva la hoja y la vista si siguen disponibles.

Si hay cambios locales, se comparan en memoria tres versiones: la última base abierta/guardada, tu edición y la revisión compartida. Las modificaciones independientes se combinan por ID y propiedad; incluye nombres, documentación, figuras, hojas, estilo y modelos ER. Los movimientos y los recorridos se tratan como operaciones completas. El resultado se revisa antes de importarlo y queda pendiente del autoguardado contra la nueva revisión `eTag`; si otra persona vuelve a guardar durante esa escritura, se vuelve a comprobar y combinar. Un borrador abierto o una edición que aparece durante la descarga pospone la combinación hasta terminarla.

**Cambios incompatibles:** si ambos cambian de manera distinta la misma propiedad, el valor ya guardado en el archivo compartido prevalece. Los otros cambios compatibles se integran, y **antes de sustituir la edición local** se conserva una copia completa: en la misma carpeta Microsoft con nombre único `… - recuperado … .bpmn`, o en **Historial local** para archivos del equipo. Un aviso permanente indica dónde recuperarla, sin pedir elegir entre versiones. Si no se puede confirmar esa copia, se conserva el editor local y se informa del fallo. Una combinación con IDs duplicados, referencias sin destino o un modelo ER inválido utiliza la revisión compartida y conserva la copia local; no intenta reparar el proceso por su cuenta.

Esto emula colaboración mediante versiones guardadas, con unos segundos de retraso. No muestra cursores ni operaciones en vivo; las actualizaciones combinadas establecen una nueva base de deshacer/rehacer. Los cambios incompatibles se conservan en la copia recuperable, no como dos valores activos de una misma propiedad. Las copias Microsoft mantienen los permisos heredados de su carpeta. Los documentos de nube no pasan al Historial local ni a servidores de Nara. La coautoría simultánea en vivo requeriría un servicio adicional.

Límite: 8 MB por BPMN. Se probaron OAuth, navegación, creación, reapertura y guardado con una cuenta de trabajo y datos genéricos en OneDrive y SharePoint. La prueba real de dos escritores sobre la misma revisión de SharePoint rechazó el segundo guardado y conservó el primero. **Falta probar cuenta personal y organización externa; la prueba de concurrencia usa dos sesiones de una misma cuenta, sin afirmar una prueba entre dos identidades distintas.**

La interfaz muestra primero el inicio de sesión. Después abre OneDrive y ofrece navegación de carpetas, selección de BPMN y acciones Abrir/Guardar. Cambiar cuenta y Desconectar están en el menú de la cuenta; los detalles de permisos están en un apartado desplegable. El [símbolo oficial de Microsoft](https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-branding-in-apps) se conserva sin alteraciones; pertenece a Microsoft y se utiliza para identificar su inicio de sesión.

El retorno de producción es `https://demo.naraconsultores.com/NaraBizagui/microsoft-auth.html`. Para desarrollo está registrado `http://localhost:8767/microsoft-auth.html`; se debe servir esta carpeta en ese origen. La página de retorno usa el puente de MSAL y no debe recibir una cabecera COOP que rompa la ventana de autenticación. La verificación de editor de Microsoft está pendiente; las políticas de otras organizaciones pueden impedir el consentimiento o exigir aprobación de su administrador. El diálogo de conexión describe los permisos y el tratamiento de los documentos.

La paleta izquierda tiene desplazamiento propio para llegar a todas las herramientas en ventanas pequeñas.

**Ampliar lienzo**, en el encabezado o en Vista, deja visibles el encabezado y el área de dibujo. Conserva el archivo, la conexión MCP y la hoja activa. **Salir de vista ampliada** o Escape recupera los paneles y la vista anterior. La atribución del motor permanece visible en el encabezado.

En participantes y carriles hay controles directos para añadir carriles arriba/abajo (izquierda/derecha si son verticales) y dividirlos en dos o tres. Las etapas muestran **＋** a izquierda y derecha y dos iconos de división en columnas, con el mismo tamaño y apariencia de los controles de participantes; los botones explican su función al pasar el mouse. Sus controles se mantienen dentro del lienzo y no se superponen al encabezado. El aspecto inicial es blanco, con borde negro fino y encabezado de 30 px, como el participante orientado en columna. El relleno se dibuja detrás de las actividades y también se incluye en las exportaciones. Se conservan el ancho total al dividir, el ajuste de bordes compartidos y las figuras existentes al insertar una columna. Los cuatro símbolos de documentos comparten el mismo vector en paleta, lienzo, vista previa y exportaciones.

El panel derecho se organiza en pestañas **Propiedades**, **Estilo**, **Texto** y **Organizar**. Ofrece relleno, color y grosor de línea, color/tamaño de texto, negrita y posición/tamaño; los tamaños fijos de BPMN se muestran como solo lectura. Cambiar de pestaña conserva los textos pendientes. En tablas ER también permite alinear el nombre de los campos. El formato se conserva en el archivo y en las exportaciones. Las hojas nuevas comienzan vacías.

## Modelos de datos: entidad-relación

Selecciona **Herramientas → Modelo de datos** para abrir o crear una hoja ER; también puedes elegir ese tipo al crear una hoja con **＋**.

- Pulsa **Tabla** o arrástrala desde las herramientas para colocar una entidad. Arrastra su encabezado para moverla y el control de la esquina para ajustar su ancho. Doble clic en el encabezado edita el nombre directamente en el lienzo.
- **＋ Campo**, dentro de la tabla, agrega una fila. Doble clic en el nombre, tipo de dato o celda de clave edita esa celda en el lienzo. Enter aplica y Escape cancela; Tab pasa a la siguiente celda. Las claves admiten PK, FK y PK/FK. Los controles de la fila permiten subir, bajar o eliminar el campo.
- **Relación** permite elegir el campo de origen y el de destino. También puedes arrastrar entre los puntos de dos campos. La relación se crea al unir los campos; el panel derecho permite ajustar los extremos, nombre y cardinalidades `1`, `0..1`, `N` y `0..N`.
- Deshacer/rehacer conserva los IDs de tablas, campos y relaciones. Eliminar un campo o tabla elimina sus relaciones asociadas; la interfaz pide confirmar cuando existen esas dependencias.

Las hojas ER se guardan junto con los procesos en el mismo `.bpmn`, como extensión Nara de `Definitions.extensionElements`. No se representan como tareas BPMN. La extensión mantiene un modelo versionado con entidades, campos, relaciones y geometría. NaraBizagui lo vuelve a abrir; otros editores pueden conservar el XML sin ofrecer su edición visual. Se comprobó la relectura con bpmn-moddle con y sin el descriptor Nara, sin prometer compatibilidad visual con otros productos.

El MCP lee `diagramType`, `dataModel` y la hoja activa, y permite editarla mediante operaciones `erd_`. SVG y PNG exportan el modelo de datos activo, incluidos campos, PK/FK y cardinalidades. Dibujar el modelo no crea ni modifica una base de datos, ni implica validar su diseño.

También se pueden elegir archivos locales de carpetas de OneDrive/SharePoint sincronizadas. En esa modalidad, el cliente de sincronización gestiona su subida a Microsoft; sus tiempos y conflictos dependen de ese cliente. Para consultar y guardar directamente en Microsoft se utiliza la conexión de la aplicación.

Los diagramas seleccionados no se suben a este sitio ni a este repositorio. Solo se publica el editor y sus recursos. Cada persona conserva sus archivos y permisos.

## Trabajo con Codex

Codex necesita acceso al mismo archivo BPMN local/sincronizado o una conexión documental autorizada. Si el navegador mantiene un FileSystemFileHandle válido, la aplicación vuelve a leer el archivo abierto y compara su contenido. Sin ediciones pendientes recarga el diagrama; con cambios pendientes muestra el conflicto y rechaza sobrescribir una base distinta. El botón **Recargar diagrama** permite volver a leer el archivo sin recargar la página completa.

El selector HTML usado como alternativa abre una copia en memoria y no puede detectar modificaciones posteriores del archivo original. La detección se reanuda al abrirlo otra vez. Las pestañas en segundo plano pueden retrasar la comprobación.

### Plugin con skill y MCP local

El plugin **NaraBizagui by NaraLab**, distribuido mediante **Nara IA Market**, incluye cuatro skills especializadas y el MCP en una sola instalación. Requiere Node.js 22 o superior y un host con ejecución local. No requiere instalar las bibliotecas del servidor por separado.

1. Instala NaraBizagui desde el market y actívalo en un chat local.
2. Pide conectar el diagrama. Codex entrega un código temporal.
3. En la pestaña elegida pulsa **Conectar con Codex**, pega el código y pulsa **Vincular esta pestaña**. Autoriza el acceso local si el navegador lo solicita.
4. Codex puede leer, editar propiedades BPMN, aplicar bloques con revisión y deshacer conjunto, auditar sin modificar, guardar en el archivo autorizado y exportar PNG para el chat o un informe.

La versión 0.7.0 organiza el trabajo en coordinación (`narabizagui`), modelado (`narabizagui-modelar`), auditoría (`narabizagui-validar`) y entrega (`narabizagui-entregar`). El recorrido habitual combina una consulta de preparación, un bloque con presentación y una confirmación visual. Sus nueve herramientas esperan el documento estable, devuelven errores accionables y respuestas compactas, y prevalidan hasta 200 operaciones con revisión, idempotencia y Deshacer. Las métricas distinguen fases del editor/transporte; no representan toda la espera del usuario. Consulta [el contrato y los límites del plugin](plugins/narabizagui/README.md#semántica-auditoría-y-bloques).

El código de vínculo es de un solo uso y vence en cinco minutos. Solo se conecta la pestaña vinculada a esa instancia del plugin. **Desconectar** revoca el vínculo y conserva el trabajo. El puente no ofrece acceso general al disco ni habilita por sí solo uso móvil, acceso entre equipos o Microsoft Graph. Los datos que se consultan mediante MCP se entregan a la conversación del asistente.

La misma pestaña recuerda su vínculo durante la sesión del navegador y lo recupera al recargar o ante cortes temporales, mientras el MCP local siga activo. Desconectar elimina ese vínculo recordado; reiniciar el servidor requiere uno nuevo. Recuperar la conexión no guarda ni restaura por sí solo un BPMN con cambios pendientes.

La herramienta `narabizagui_export_png` devuelve la hoja activa completa como imagen al chat y como archivo temporal local, listo para incorporarlo a Word/PDF. Fondo blanco y escala ajustable, con límites de tamaño. Exportar no guarda el BPMN. Consulta los requisitos y herramientas en [el plugin](plugins/narabizagui/README.md).

## Recursos

Cada pestaña de hoja tiene un menú **⋯** (también con clic derecho o Mayús+F10) para cambiar nombre, duplicar o eliminar. Duplicar conserva contenido y geometría con IDs nuevos, incluidas hojas de datos y detalles de subprocesos. Eliminar pide confirmación y se recupera con Deshacer; una hoja llamada desde otra actividad debe desvincularse primero. El archivo conserva al menos una hoja BPMN.

Al abrir el detalle de un subproceso contraído o una actividad de llamada aparece **← Volver a [hoja de origen]** dentro del lienzo, también en vista ampliada. El retorno restaura la vista y selecciona la actividad que abrió el detalle; las llamadas anidadas vuelven un nivel cada vez. El nombre completo está en la etiqueta accesible del botón y al pasar el puntero. Abrir una pestaña directamente inicia una visita sin llamador. El contexto se descarta al importar otro documento o si la llamada deja de ser válida; no se guarda en el BPMN ni en las imágenes exportadas. Los subprocesos expandidos conservan su contenido en el lienzo: abrir detalle no los contrae automáticamente.

Al editar flechas, los extremos cercanos se acoplan al borde y la vista previa usa el recorrido final sin diagonales. Mover el extremo común de una flecha con un tramo compartido la independiza para respetar la nueva entrada o salida elegida. Alt evita el acople automático.

`index.html`, `modelador.js`, `editor-tools.js`, `sheets.js`, `erd-model.js`, `erd-editor.js`, `editor-style.js`, `archivos.js`, `mcp-editor.js`, `mcp-bridge.js`, `modelador.css` y `assets/` forman la aplicación. `manifest.json` registra sus hashes al empaquetar. Las dependencias y su licencia se conservan en `vendor/`. El servidor MCP y la skill viven en `plugins/narabizagui/`; la web estática no ejecuta el servidor.

Para desarrollar el plugin: `npm ci`, `npm run build`, `npm test`. El build incluye sus dependencias y licencias en el paquete y actualiza el manifiesto web.

Después de publicar la web, `node scripts/verify-public.mjs` compara los recursos distribuidos con el manifiesto y conserva el resultado privado bajo `local/`.

La licencia de bpmn-js exige conservar visible el distintivo bpmn.io; se muestra fuera del lienzo. Ver [licencia incluida](vendor/LICENSE.txt).

## Alcance de la web pública

El código y la herramienta son públicos. No hay registro de usuarios, permisos por repositorio ni almacenamiento de documentos de clientes en GitHub Pages. Publicar un archivo BPMN en este repositorio lo haría público: los documentos de trabajo deben permanecer fuera del repositorio.

## Proyectos en pestañas distintas

Archivo → **Nuevo proyecto en otra pestaña** abre un editor independiente. Cada pestaña conserva el archivo autorizado y su cuenta Microsoft; los recientes siguen disponibles sin sustituir el documento de otra pestaña. La recuperación local requiere que el navegador conserve el permiso del archivo.

Una segunda apertura del mismo archivo queda en consulta. **Editar aquí** solicita transferir la edición: la pestaña anterior debe haber guardado y terminado sus ediciones pendientes. Los vínculos MCP son independientes; una copia de una pestaña no hereda su autorización. El plugin 0.9.0 identifica el documento esperado además de su revisión. **Desconectar esta pestaña** conserva las demás conexiones Microsoft; **Cerrar todas las conexiones** las invalida en esta aplicación.

El aislamiento de edición utiliza Web Locks y funciona dentro del mismo perfil y origen del navegador. Las revisiones y protecciones de guardado existentes siguen comprobando cambios de otros navegadores o equipos.
