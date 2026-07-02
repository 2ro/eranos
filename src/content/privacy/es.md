_Última actualización: 18 de marzo de 2026_

## Resumen

{{appName}} es una aplicación cliente para el **protocolo Nostr**, una red de comunicación abierta y descentralizada. Esta política de privacidad explica cómo {{appName}} maneja sus datos y qué información se comparte cuando utiliza la aplicación.

## Cómo funciona Nostr

Nostr es un protocolo descentralizado. Cuando publica contenido, este se envía a uno o varios **relés** (servidores independientes) que usted elige. {{appName}} no opera estos relés y no tiene control sobre los datos almacenados en ellos. El contenido publicado en los relés de Nostr es **público de forma predeterminada** y puede ser visible para cualquier persona.

## Datos que recopilamos

{{appName}} está diseñado para minimizar la recopilación de datos. Esto es a lo que accede la aplicación:

- **Clave pública:** Su clave pública de Nostr se utiliza para identificar su cuenta. No se considera información privada en la red Nostr.
- **Conexiones de relés:** La aplicación se conecta a los relés de Nostr en su nombre para obtener y publicar eventos. Los operadores de relés pueden registrar metadatos de conexión, como su dirección IP.
- **Almacenamiento local:** Las preferencias, la información de la cuenta y los datos en caché se almacenan localmente en su navegador. Estos datos no salen de su dispositivo a menos que los publique explícitamente.
- **Eventos publicados:** Cualquier contenido que publique (publicaciones, reacciones, actualizaciones de perfil, etc.) se envía a los relés que ha configurado y pasa a formar parte de la red pública de Nostr.

## Claves privadas

{{appName}} admite la firma mediante extensiones del navegador (NIP-07) y otros firmantes externos. Cuando utiliza estos métodos, su clave privada la gestiona el firmante y **nunca** es accedida ni almacenada por {{appName}}. Le recomendamos encarecidamente utilizar una extensión del navegador o un firmante de hardware para proteger su clave privada.

## Subidas de archivos

Cuando sube archivos (imágenes, vídeos, etc.), estos se envían a servidores de archivos compatibles con Blossom. Estos servidores son operados por terceros y pueden tener sus propias políticas de privacidad. Los archivos subidos suelen ser accesibles públicamente a través de sus URLs.

## Analítica

{{appName}} puede utilizar herramientas analíticas respetuosas con la privacidad (como Plausible) para comprender los patrones generales de uso. Estas herramientas no utilizan cookies, no rastrean a usuarios individuales y no recopilan información personal.

## Servicios de terceros

La aplicación puede interactuar con los siguientes servicios de terceros:

- **Relés de Nostr:** Para leer y publicar eventos
- **Servidores Blossom:** Para subir archivos y alojar contenido multimedia
- **Proveedores NIP-05:** Para verificar direcciones de Nostr

Cada uno de estos servicios es operado de forma independiente y puede tener sus propias prácticas de manejo de datos.

## Eliminación de datos

Dado que Nostr es un protocolo descentralizado, {{appName}} no puede garantizar la eliminación del contenido una vez publicado en los relés. Puede solicitar la eliminación publicando un evento de borrado (NIP-09), pero los relés individuales no están obligados a atender estas solicitudes. Para borrar los datos locales, puede limpiar el almacenamiento de su navegador para este sitio.

## Cambios en esta política

Podemos actualizar esta política de privacidad de vez en cuando. Los cambios se reflejarán en esta página con una fecha actualizada. El uso continuado de {{appName}} después de los cambios constituye la aceptación de la política revisada.

## Contacto

Si tiene preguntas sobre esta política de privacidad, puede contactar con el equipo que está detrás de {{appName}} en [soapbox.pub](https://soapbox.pub).
