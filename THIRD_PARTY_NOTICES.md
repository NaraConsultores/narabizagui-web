# Dependencias

El editor utiliza **bpmn-js 18.16.0**, de Camunda Services GmbH, distribuido con los recursos de diagram-js y la fuente BPMN de su paquete.

Se conserva íntegra la [licencia del paquete](vendor/LICENSE.txt), incluida su condición de mantener visible el distintivo enlazado bpmn.io. La aplicación no modifica el archivo distribuido `vendor/bpmn-modeler.production.min.js`.

La marca NaraFlows es un recurso de la aplicación. No se incluyen documentos operativos ni diagramas de clientes.

El servidor MCP incorpora el SDK oficial de Model Context Protocol y sus dependencias. Sus versiones, atribuciones y textos de licencia se incluyen en [las licencias del servidor](plugins/naraflows/server/dist/THIRD_PARTY_NOTICES.txt). El build regenera este archivo a partir de las bibliotecas efectivamente incorporadas. Esbuild se usa solo durante la construcción.
