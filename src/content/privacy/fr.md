_Dernière mise à jour : 18 mars 2026_

## Aperçu

{{appName}} est une application cliente pour le **protocole Nostr**, un réseau de communication ouvert et décentralisé. Cette politique de confidentialité explique comment {{appName}} gère vos données et quelles informations sont partagées lorsque vous utilisez l'application.

## Comment fonctionne Nostr

Nostr est un protocole décentralisé. Lorsque vous publiez du contenu, il est envoyé à un ou plusieurs **relais** (serveurs indépendants) que vous choisissez. {{appName}} n'exploite pas ces relais et n'a aucun contrôle sur les données qui y sont stockées. Le contenu publié sur les relais Nostr est **public par défaut** et peut être visible par n'importe qui.

## Données que nous collectons

{{appName}} est conçu pour minimiser la collecte de données. Voici ce à quoi l'application accède :

- **Clé publique :** Votre clé publique Nostr est utilisée pour identifier votre compte. Elle n'est pas considérée comme une information privée sur le réseau Nostr.
- **Connexions aux relais :** L'application se connecte aux relais Nostr en votre nom pour récupérer et publier des événements. Les opérateurs de relais peuvent enregistrer des métadonnées de connexion telles que votre adresse IP.
- **Stockage local :** Préférences, informations de compte et données mises en cache sont stockées localement dans votre navigateur. Ces données ne quittent pas votre appareil sauf si vous les publiez explicitement.
- **Événements publiés :** Tout contenu que vous publiez (publications, réactions, mises à jour de profil, etc.) est envoyé à vos relais configurés et devient partie intégrante du réseau Nostr public.

## Clés privées

{{appName}} prend en charge la signature via des extensions de navigateur (NIP-07) et d'autres signataires externes. Lors de l'utilisation de ces méthodes, votre clé privée est gérée par le signataire et n'est **jamais** consultée ou stockée par {{appName}}. Nous recommandons fortement d'utiliser une extension de navigateur ou un signataire matériel pour protéger votre clé privée.

## Téléversement de fichiers

Lorsque vous téléversez des fichiers (images, vidéos, etc.), ils sont envoyés à des serveurs de fichiers compatibles Blossom. Ces serveurs sont exploités par des tiers et peuvent avoir leurs propres politiques de confidentialité. Les fichiers téléversés sont généralement accessibles au public via leurs URL.

## Analyses

{{appName}} peut utiliser des analyses respectueuses de la vie privée (telles que Plausible) pour comprendre les modèles d'utilisation généraux. Ces analyses n'utilisent pas de cookies, ne suivent pas les utilisateurs individuels et ne collectent pas d'informations personnelles.

## Services tiers

L'application peut interagir avec les services tiers suivants :

- **Relais Nostr :** Pour lire et publier des événements
- **Serveurs Blossom :** Pour le téléversement de fichiers et l'hébergement de médias
- **Fournisseurs NIP-05 :** Pour la vérification des adresses Nostr

Chacun de ces services est exploité indépendamment et peut avoir ses propres pratiques de traitement des données.

## Suppression de données

Comme Nostr est un protocole décentralisé, {{appName}} ne peut pas garantir la suppression du contenu une fois qu'il a été publié sur les relais. Vous pouvez demander la suppression en publiant un événement de suppression (NIP-09), mais les relais individuels ne sont pas obligés d'honorer ces demandes. Pour effacer les données locales, vous pouvez vider le stockage de votre navigateur pour ce site.

## Modifications de cette politique

Nous pouvons mettre à jour cette politique de confidentialité de temps en temps. Les modifications seront reflétées sur cette page avec une date mise à jour. L'utilisation continue de {{appName}} après les modifications constitue l'acceptation de la politique révisée.

## Contact

Si vous avez des questions concernant cette politique de confidentialité, vous pouvez joindre l'équipe derrière {{appName}} sur [goblin.st/team](https://goblin.st/team).
