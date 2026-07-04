_Dernière mise à jour : 19 mars 2026_

## Notre engagement

{{appName}} applique une **politique de tolérance zéro** envers les contenus d'exploitation et d'abus sexuels d'enfants (CSAE). La sécurité des enfants est primordiale, et nous nous engageons à faire tout ce qui est en notre pouvoir en tant qu'application cliente pour empêcher la distribution, la promotion ou la facilitation de contenus CSAE via notre application.

Cette politique s'applique à tout contenu accessible via {{appName}}, y compris le texte, les images, les vidéos, les liens et tout autre média. Elle couvre toutes les formes de CSAE, y compris, sans s'y limiter, l'imagerie, la sollicitation, le grooming, la traite et la sexualisation de mineurs.

## Comment fonctionne {{appName}}

{{appName}} est une **application cliente** pour le protocole Nostr, un réseau de communication ouvert et décentralisé. Comprendre l'architecture est un contexte important pour cette politique :

- **Notre infrastructure :** Nous exploitons le **relais Eranos** et le **serveur Blossom Eranos**, qui servent de relais et d'hôte de fichiers par défaut pour {{appName}}. Nous avons un contrôle complet de modération sur le contenu stocké sur ces services.
- **Relais tiers :** Les utilisateurs peuvent également se connecter à d'autres relais Nostr exploités par des tiers indépendants. {{appName}} récupère et affiche le contenu de tous les relais auxquels l'utilisateur est connecté. Nous n'avons pas de contrôle de modération sur les relais tiers, mais nous contrôlons ce que l'application affiche.
- **Serveurs de médias tiers :** Les utilisateurs peuvent téléverser des images et des vidéos sur des serveurs de fichiers tiers compatibles Blossom. Nous n'exploitons ni ne modérons ces services externes.

Nous assumons l'entière responsabilité de l'expérience au sein de notre application. Sur notre propre infrastructure (relais Eranos et serveur Blossom Eranos), nous pouvons directement supprimer le contenu et bannir les comptes contrevenants. Pour le contenu provenant de services tiers, nous le bloquons activement pour qu'il ne s'affiche pas dans {{appName}}.

## Contenu et comportement interdits

Ce qui suit est strictement interdit sur {{appName}}. Les utilisateurs trouvés à se livrer à l'un des éléments suivants feront l'objet de mesures immédiates :

- **CSAM (matériel d'abus sexuel sur enfants) :** Toute représentation visuelle de conduite sexuelle explicite impliquant un mineur, y compris les photographies, vidéos et images générées numériquement ou par IA.
- **Grooming :** Toute tentative de construire une relation avec un mineur dans le but d'exploitation ou d'abus sexuel.
- **Sollicitation :** Demande, offre ou facilitation de l'échange de matériel CSAE ou de contact sexuel avec des mineurs.
- **Sexualisation de mineurs :** Contenu qui sexualise les mineurs, y compris des commentaires suggestifs ou sexuels sur des enfants, même si aucune imagerie explicite n'est impliquée.
- **Traite :** Tout contenu qui facilite, promeut ou coordonne la traite de mineurs à des fins sexuelles.
- **Liens et références :** Partage de liens vers des sites externes ou des ressources contenant du matériel CSAE, ou fourniture d'instructions sur la façon de trouver ou de produire un tel matériel.

## Détection et prévention

{{appName}} met en œuvre plusieurs couches de protection pour combattre la CSAE :

- **Filtrage de contenu :** Nous maintenons et appliquons des mécanismes de filtrage de contenu dans l'application pour bloquer l'affichage de matériel CSAE connu, quel que soit le relais d'origine.
- **Signalement par les utilisateurs :** Nous fournissons des outils de signalement intégrés à l'application qui permettent aux utilisateurs de signaler tout contenu CSAE suspect pour examen immédiat.
- **Modération du relais Eranos :** Sur notre propre relais Eranos, nous modérons activement le contenu et supprimons immédiatement tout matériel CSAE et bannissons définitivement les comptes associés.
- **Modération du serveur Blossom Eranos :** Sur notre propre serveur de fichiers Blossom Eranos, nous supprimerons immédiatement tout média CSAE et bannirons le compte qui l'a téléversé.
- **Blocage des relais tiers :** Les relais tiers connus pour héberger ou tolérer le matériel CSAE peuvent être retirés de la liste de relais par défaut de {{appName}} et bloqués pour être ajoutés par les utilisateurs.
- **Outils de mise en sourdine et de blocage :** Les utilisateurs peuvent mettre en sourdine ou bloquer des comptes au niveau du client, empêchant le contenu de ces comptes d'apparaître dans leur fil.

## Actions d'application

Lorsqu'un contenu ou un comportement CSAE est identifié, {{appName}} prendra les mesures suivantes selon le cas :

- **Blocage immédiat du contenu :** Le contenu CSAE connu sera bloqué à l'affichage dans l'application par des filtres de contenu et des listes de blocage.
- **Suppression de l'infrastructure Eranos :** Le contenu CSAE sur le relais Eranos et le serveur Blossom Eranos sera immédiatement supprimé, et les comptes associés bannis définitivement.
- **Blocage de comptes :** Les clés publiques Nostr associées à l'activité CSAE seront ajoutées aux listes de blocage au niveau de l'application, empêchant leur contenu d'apparaître dans {{appName}} quel que soit le relais d'où il est récupéré.
- **Blocage de relais :** Les relais tiers qui ne traitent pas le contenu CSAE peuvent être retirés de la liste de relais par défaut de {{appName}} et bloqués pour être ajoutés par les utilisateurs.
- **Signalement aux autorités :** Nous signalerons le matériel CSAE identifié au [National Center for Missing & Exploited Children (NCMEC)](https://www.missingkids.org/gethelpnow/cybertipline) via la CyberTipline, et aux agences d'application de la loi applicables.

## Signalement de contenu CSAE

Si vous rencontrez sur {{appName}} un contenu que vous pensez constituer un abus sexuel ou une exploitation d'enfants, veuillez le signaler immédiatement :

- **Signalement dans l'application :** Utilisez le bouton de signalement disponible sur toute publication ou profil d'utilisateur pour signaler le contenu pour examen.
- **Contactez-nous directement :** Contactez notre équipe sur [goblin.st/team](https://goblin.st/team) avec les détails du contenu, y compris tous les ID d'événement Nostr ou clés publiques pertinents.
- **Signaler au NCMEC :** Vous pouvez également déposer un rapport directement auprès de la [NCMEC CyberTipline](https://www.missingkids.org/gethelpnow/cybertipline).
- **Contacter les forces de l'ordre :** Si vous pensez qu'un enfant est en danger immédiat, contactez immédiatement les forces de l'ordre locales ou appelez le **911** (États-Unis).

Tous les signalements de contenu CSAE sont traités avec la plus haute priorité et seront examinés aussi rapidement que possible.

## Coopération avec les forces de l'ordre

{{appName}} s'engage à coopérer pleinement avec les agences d'application de la loi enquêtant sur la CSAE. Bien que {{appName}} ne stocke pas le contenu utilisateur sur ses propres serveurs, nous :

- Fournirons toute information dont nous disposons — y compris les données du relais Eranos et du serveur Blossom Eranos — qui peut aider aux enquêtes, conformément à la loi applicable.
- Identifierons et partagerons les URL spécifiques de relais et de serveurs de fichiers où le contenu contrevenant a été observé, afin que les forces de l'ordre puissent contacter directement ces opérateurs.
- Préserverons toute preuve ou information disponible à la réception d'une demande légale valide.
- Signalerons proactivement le matériel CSAE identifié au NCMEC et aux autres autorités compétentes.

## Considérations sur l'architecture décentralisée

La nature décentralisée de Nostr signifie qu'aucune entité unique n'a un contrôle complet sur tout le contenu du réseau. {{appName}} reconnaît les réalités suivantes et notre approche pour chacune :

- **Contrôle complet sur notre propre infrastructure :** Nous pouvons et supprimons le contenu du relais Eranos et du serveur Blossom Eranos. Le matériel CSAE trouvé sur notre infrastructure est supprimé immédiatement et les comptes sont bannis définitivement.
- **Contrôle limité sur les relais tiers :** Nous ne pouvons pas supprimer le contenu des relais tiers. Cependant, nous bloquons l'affichage de ce contenu dans notre application via des filtres et des listes de blocage au niveau du client.
- **Les utilisateurs contrôlent leurs connexions aux relais :** Bien que les utilisateurs puissent se connecter aux relais de leur choix, {{appName}} se réserve le droit de bloquer les connexions aux relais connus pour héberger du contenu CSAE.
- **Les clés publiques sont pseudonymes :** Les comptes Nostr sont identifiés par des paires de clés cryptographiques plutôt que par des identités vérifiées. Nous bloquerons et signalerons toujours les clés contrevenantes et coopérerons avec les forces de l'ordre pour identifier les individus derrière elles.

## Recours

Si vous pensez que votre contenu ou votre compte a été signalé ou bloqué à tort en vertu de cette politique, vous pouvez nous contacter sur [goblin.st/team](https://goblin.st/team) pour demander un examen. Nous évaluerons les recours au cas par cas. Cependant, nous penchons du côté de la sécurité des enfants dans toutes les décisions, et notre détermination est définitive.

## Modifications de cette politique

Nous pouvons mettre à jour cette politique de sécurité des enfants à mesure que nos outils, processus et l'écosystème Nostr évoluent. Les modifications seront reflétées sur cette page avec une date mise à jour. Nous nous engageons à améliorer continuellement notre capacité à détecter, prévenir et répondre au contenu CSAE.

## Contact

Pour des questions concernant cette politique ou pour signaler du contenu CSAE, contactez l'équipe derrière {{appName}} sur [goblin.st/team](https://goblin.st/team).
