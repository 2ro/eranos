_Última actualización: 19 de marzo de 2026_

## Nuestro compromiso

{{appName}} mantiene una política de **tolerancia cero** frente al material de abuso y explotación sexual infantil (CSAE, por sus siglas en inglés). La seguridad de la infancia es primordial, y como aplicación cliente nos comprometemos a hacer todo lo que esté en nuestra mano para evitar la distribución, promoción o facilitación de contenido CSAE a través de nuestra aplicación.

Esta política se aplica a todo el contenido accesible a través de {{appName}}, incluidos textos, imágenes, vídeos, enlaces y cualquier otro medio. Abarca todas las formas de CSAE, incluidas, entre otras, imágenes, solicitudes, grooming, trata y sexualización de menores.

## Cómo funciona {{appName}}

{{appName}} es una **aplicación cliente** para el protocolo Nostr, una red de comunicación abierta y descentralizada. Comprender la arquitectura es un contexto importante para esta política:

- **Nuestra infraestructura:** Operamos el **relé Eranos** y el **servidor Eranos Blossom**, que sirven como relé y servidor de archivos predeterminados para {{appName}}. Tenemos control de moderación total sobre el contenido almacenado en estos servicios.
- **Relés de terceros:** Los usuarios también pueden conectarse a otros relés Nostr operados por terceros independientes. {{appName}} obtiene y muestra contenido desde cualquier relé al que el usuario esté conectado. No tenemos control de moderación sobre los relés de terceros, pero sí controlamos lo que la aplicación muestra.
- **Servidores de medios de terceros:** Los usuarios pueden subir imágenes y vídeos a servidores de archivos de terceros compatibles con Blossom. No operamos ni moderamos estos servicios externos.

Asumimos plena responsabilidad por la experiencia dentro de nuestra aplicación. En nuestra propia infraestructura (relé Eranos y servidor Eranos Blossom), podemos eliminar contenido y vetar las cuentas infractoras directamente. Para el contenido procedente de servicios de terceros, bloqueamos activamente su visualización dentro de {{appName}}.

## Contenido y comportamiento prohibidos

Lo siguiente está estrictamente prohibido en {{appName}}. Las personas usuarias que incurran en cualquiera de los siguientes comportamientos serán objeto de acción inmediata:

- **CSAM (material de abuso sexual infantil):** Cualquier representación visual de conducta sexual explícita que involucre a una persona menor de edad, incluidas fotografías, vídeos e imágenes generadas digitalmente o por IA.
- **Grooming:** Cualquier intento de establecer una relación con una persona menor de edad con fines de explotación o abuso sexual.
- **Solicitud:** Solicitar, ofrecer o facilitar el intercambio de material CSAE o el contacto sexual con menores.
- **Sexualización de menores:** Contenido que sexualice a menores, incluidos comentarios sugerentes o sexuales sobre infantes, aun cuando no haya imágenes explícitas.
- **Trata:** Cualquier contenido que facilite, promueva o coordine la trata de menores con fines sexuales.
- **Enlaces y referencias:** Compartir enlaces a sitios o recursos externos que contengan material CSAE, o proporcionar instrucciones para encontrar o producir dicho material.

## Detección y prevención

{{appName}} implementa múltiples capas de protección para combatir el CSAE:

- **Filtrado de contenido:** Mantenemos y aplicamos mecanismos de filtrado dentro de la aplicación para bloquear la visualización de material CSAE conocido, independientemente del relé del que provenga.
- **Reporte de usuarios:** Ofrecemos herramientas de reporte dentro de la aplicación que permiten a las personas usuarias señalar contenido sospechoso de CSAE para una revisión inmediata.
- **Moderación del relé Eranos:** En nuestro propio relé Eranos, moderamos activamente el contenido y eliminaremos de inmediato cualquier material CSAE, vetando permanentemente las cuentas asociadas.
- **Moderación del servidor Eranos Blossom:** En nuestro propio servidor de archivos Eranos Blossom, eliminaremos de inmediato cualquier medio CSAE y vetaremos la cuenta que lo haya subido.
- **Bloqueo de relés de terceros:** Los relés de terceros que se sepa que alojan o toleran material CSAE pueden ser eliminados de la lista de relés predeterminada de {{appName}} y bloqueados para que los usuarios no puedan añadirlos.
- **Herramientas de silencio y bloqueo:** Las personas usuarias pueden silenciar o bloquear cuentas a nivel de cliente, evitando que el contenido de esas cuentas aparezca en su feed.

## Acciones de cumplimiento

Cuando se identifica contenido o comportamiento de tipo CSAE, {{appName}} tomará las siguientes acciones según corresponda:

- **Bloqueo inmediato de contenido:** El contenido CSAE conocido será bloqueado para que no se renderice en la aplicación mediante filtros y listas de bloqueo.
- **Eliminación de la infraestructura de Eranos:** El contenido CSAE en el relé Eranos y en el servidor Eranos Blossom será eliminado de inmediato, y las cuentas asociadas, vetadas permanentemente.
- **Bloqueo de cuentas:** Las claves públicas de Nostr asociadas a actividad CSAE se añadirán a las listas de bloqueo a nivel de aplicación, evitando que su contenido aparezca en {{appName}} independientemente del relé desde el que se obtenga.
- **Bloqueo de relés:** Los relés de terceros que no aborden el contenido CSAE pueden ser eliminados de la lista de relés predeterminada de {{appName}} y bloqueados para que los usuarios no puedan añadirlos.
- **Reporte a las autoridades:** Reportaremos el material CSAE identificado al [National Center for Missing & Exploited Children (NCMEC)](https://www.missingkids.org/gethelpnow/cybertipline) a través de CyberTipline, y a las agencias de aplicación de la ley pertinentes.

## Cómo reportar contenido CSAE

Si encuentra cualquier contenido en {{appName}} que considere que constituye abuso o explotación sexual infantil, por favor repórtelo de inmediato:

- **Reporte dentro de la app:** Use el botón de reporte disponible en cualquier publicación o perfil de usuario para señalar el contenido para revisión.
- **Contáctenos directamente:** Comuníquese con nuestro equipo en [soapbox.pub](https://soapbox.pub) con los detalles del contenido, incluidos cualesquiera identificadores de eventos de Nostr o claves públicas relevantes.
- **Reporte a NCMEC:** También puede presentar un reporte directamente en la [línea CyberTipline de NCMEC](https://www.missingkids.org/gethelpnow/cybertipline).
- **Contacte a las autoridades:** Si cree que una persona menor está en peligro inminente, comuníquese con la policía local o llame al **911** (EE. UU.) de inmediato.

Todos los reportes de contenido CSAE se tratan con la máxima prioridad y se revisarán lo antes posible.

## Cooperación con las autoridades

{{appName}} se compromete a cooperar plenamente con las autoridades que investiguen casos de CSAE. Aunque {{appName}} no almacena contenido de personas usuarias en sus propios servidores, haremos lo siguiente:

- Proporcionar cualquier información de la que dispongamos —incluidos datos del relé Eranos y del servidor Eranos Blossom— que pueda asistir en las investigaciones, de conformidad con la ley aplicable.
- Identificar y compartir las URL específicas de los relés y de los servidores de archivos donde se observó el contenido infractor, para que las autoridades puedan contactar directamente con esos operadores.
- Preservar cualquier evidencia o información disponible al recibir un requerimiento legal válido.
- Reportar de manera proactiva el material CSAE identificado a NCMEC y a otras autoridades pertinentes.

## Consideraciones sobre la arquitectura descentralizada

La naturaleza descentralizada de Nostr implica que ninguna entidad tiene control completo sobre todo el contenido de la red. {{appName}} reconoce las siguientes realidades y nuestro enfoque ante cada una:

- **Control total sobre nuestra propia infraestructura:** Podemos eliminar —y eliminamos— contenido del relé Eranos y del servidor Eranos Blossom. El material CSAE detectado en nuestra infraestructura se elimina de inmediato y las cuentas son vetadas permanentemente.
- **Control limitado sobre relés de terceros:** No podemos eliminar contenido de relés de terceros. Sin embargo, bloqueamos la visualización de dicho contenido dentro de nuestra aplicación mediante filtros y listas de bloqueo a nivel de cliente.
- **Las personas usuarias controlan sus conexiones a relés:** Aunque las personas usuarias pueden conectarse a los relés que elijan, {{appName}} se reserva el derecho de bloquear las conexiones a relés que se sepa que alojan contenido CSAE.
- **Las claves públicas son seudónimas:** Las cuentas de Nostr se identifican mediante pares de claves criptográficas en lugar de identidades verificadas. Aun así, bloquearemos y reportaremos las claves infractoras y cooperaremos con las autoridades para identificar a las personas detrás de ellas.

## Apelaciones

Si cree que su contenido o cuenta ha sido marcado o bloqueado incorrectamente en virtud de esta política, puede ponerse en contacto con nosotros en [soapbox.pub](https://soapbox.pub) para solicitar una revisión. Evaluaremos las apelaciones caso por caso. No obstante, en todas las decisiones priorizamos la seguridad infantil, y nuestra determinación es final.

## Cambios en esta política

Podemos actualizar esta política de seguridad infantil a medida que evolucionan nuestras herramientas, procesos y el ecosistema Nostr. Los cambios se reflejarán en esta página con una fecha actualizada. Estamos comprometidos con la mejora continua de nuestra capacidad para detectar, prevenir y responder al contenido CSAE.

## Contacto

Para cuestiones relativas a esta política o para reportar contenido CSAE, contacte al equipo detrás de {{appName}} en [soapbox.pub](https://soapbox.pub).
