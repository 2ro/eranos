_Last updated: March 18, 2026_

## Overview

{{appName}} is a client application for the **Nostr protocol**, an open, decentralized communication network. This privacy policy explains how {{appName}} handles your data and what information is shared when you use the app.

## How Nostr Works

Nostr is a decentralized protocol. When you publish content, it is sent to one or more **relays** (independent servers) that you choose. {{appName}} does not operate these relays and has no control over data stored on them. Content published to Nostr relays is **public by default** and may be visible to anyone.

## Data We Collect

{{appName}} is designed to minimize data collection. Here is what the app accesses:

- **Public key:** Your Nostr public key is used to identify your account. It is not considered private information on the Nostr network.
- **Relay connections:** The app connects to Nostr relays on your behalf to fetch and publish events. Relay operators may log connection metadata such as your IP address.
- **Local storage:** Preferences, account information, and cached data are stored locally in your browser. This data does not leave your device unless you explicitly publish it.
- **Published events:** Any content you publish (posts, reactions, profile updates, etc.) is sent to your configured relays and becomes part of the public Nostr network.

## Private Keys

{{appName}} supports signing via browser extensions (NIP-07) and other external signers. When using these methods, your private key is managed by the signer and is **never** accessed or stored by {{appName}}. We strongly recommend using a browser extension or hardware signer to protect your private key.

## File Uploads

When you upload files (images, videos, etc.), they are sent to Blossom-compatible file servers. These servers are operated by third parties and may have their own privacy policies. Uploaded files are generally publicly accessible via their URLs.

## Analytics

{{appName}} may use privacy-friendly analytics (such as Plausible) to understand general usage patterns. These analytics do not use cookies, do not track individual users, and do not collect personal information.

## Third-Party Services

The app may interact with the following third-party services:

- **Nostr relays:** For reading and publishing events
- **Blossom servers:** For file uploads and media hosting
- **NIP-05 providers:** For verifying Nostr addresses

Each of these services is operated independently and may have its own data handling practices.

## Data Removal

Because Nostr is a decentralized protocol, {{appName}} cannot guarantee the deletion of content once it has been published to relays. You can request deletion by publishing a delete event (NIP-09), but individual relays are not obligated to honor these requests. To clear local data, you can clear your browser's storage for this site.

## Changes to This Policy

We may update this privacy policy from time to time. Changes will be reflected on this page with an updated date. Continued use of {{appName}} after changes constitutes acceptance of the revised policy.

## Contact

If you have questions about this privacy policy, you can reach the team behind {{appName}} at [goblin.st/team](https://goblin.st/team).
