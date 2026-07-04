_Last updated: March 19, 2026_

## Our Commitment

{{appName}} has a **zero-tolerance policy** toward child sexual abuse and exploitation (CSAE) material. The safety of children is paramount, and we are committed to doing everything within our power as a client application to prevent the distribution, promotion, or facilitation of CSAE content through our app.

This policy applies to all content accessible through {{appName}}, including text, images, videos, links, and any other media. It covers all forms of CSAE, including but not limited to imagery, solicitation, grooming, trafficking, and the sexualization of minors.

## How {{appName}} Works

{{appName}} is a **client application** for the Nostr protocol, an open, decentralized communication network. Understanding the architecture is important context for this policy:

- **Our infrastructure:** We operate the **Eranos relay** and **Eranos Blossom server**, which serve as the default relay and file host for {{appName}}. We have full moderation control over content stored on these services.
- **Third-party relays:** Users may also connect to additional Nostr relays operated by independent third parties. {{appName}} fetches and renders content from whatever relays the user is connected to. We do not have moderation control over third-party relays, but we control what the app displays.
- **Third-party media servers:** Users may upload images and videos to third-party Blossom-compatible file servers. We do not operate or moderate these external services.

We take full responsibility for the experience within our app. On our own infrastructure (Eranos relay and Eranos Blossom server), we can directly remove content and ban offending accounts. For content originating from third-party services, we actively block it from being displayed within {{appName}}.

## Prohibited Content and Behavior

The following is strictly prohibited on {{appName}}. Users found engaging in any of the following will be subject to immediate action:

- **CSAM (Child Sexual Abuse Material):** Any visual depiction of sexually explicit conduct involving a minor, including photographs, videos, and digitally or AI-generated images.
- **Grooming:** Any attempt to build a relationship with a minor for the purpose of sexual exploitation or abuse.
- **Solicitation:** Requesting, offering, or facilitating the exchange of CSAE material or sexual contact with minors.
- **Sexualization of minors:** Content that sexualizes minors, including suggestive or sexual commentary about children, even if no explicit imagery is involved.
- **Trafficking:** Any content that facilitates, promotes, or coordinates the trafficking of minors for sexual purposes.
- **Links and references:** Sharing links to external sites or resources containing CSAE material, or providing instructions on how to find or produce such material.

## Detection and Prevention

{{appName}} implements multiple layers of protection to combat CSAE:

- **Content filtering:** We maintain and enforce content filtering mechanisms within the app to block known CSAE material from being displayed, regardless of which relay it originates from.
- **User reporting:** We provide in-app reporting tools that allow users to flag suspected CSAE content for immediate review.
- **Eranos relay moderation:** On our own Eranos relay, we actively moderate content and will immediately remove any CSAE material and permanently ban associated accounts.
- **Eranos Blossom server moderation:** On our own Eranos Blossom file server, we will immediately delete any CSAE media and ban the uploading account.
- **Third-party relay blocking:** Third-party relays known to host or tolerate CSAE material may be removed from {{appName}}'s default relay list and blocked from being added by users.
- **Mute and block tools:** Users can mute or block accounts at the client level, preventing content from those accounts from appearing in their feed.

## Enforcement Actions

When CSAE content or behavior is identified, {{appName}} will take the following actions as applicable:

- **Immediate content blocking:** Known CSAE content will be blocked from rendering in the app through content filters and blocklists.
- **Removal from Eranos infrastructure:** CSAE content on the Eranos relay and Eranos Blossom server will be immediately deleted, and the associated accounts permanently banned.
- **Account blocking:** Nostr public keys associated with CSAE activity will be added to app-level blocklists, preventing their content from appearing in {{appName}} regardless of which relay it is fetched from.
- **Relay blocking:** Third-party relays that fail to address CSAE content may be removed from {{appName}}'s default relay list and blocked from being added by users.
- **Reporting to authorities:** We will report identified CSAE material to the [National Center for Missing & Exploited Children (NCMEC)](https://www.missingkids.org/gethelpnow/cybertipline) via the CyberTipline, and to applicable law enforcement agencies.

## Reporting CSAE Content

If you encounter any content on {{appName}} that you believe constitutes child sexual abuse or exploitation, please report it immediately:

- **In-app reporting:** Use the report button available on any post or user profile to flag content for review.
- **Contact us directly:** Reach out to our team at [goblin.st/team](https://goblin.st/team) with details of the content, including any relevant Nostr event IDs or public keys.
- **Report to NCMEC:** You can also file a report directly with the [NCMEC CyberTipline](https://www.missingkids.org/gethelpnow/cybertipline).
- **Contact law enforcement:** If you believe a child is in immediate danger, contact your local law enforcement or call **911** (US) immediately.

All reports of CSAE content are treated with the highest priority and will be reviewed as quickly as possible.

## Cooperation with Law Enforcement

{{appName}} is committed to cooperating fully with law enforcement agencies investigating CSAE. While {{appName}} does not store user content on its own servers, we will:

- Provide any information available to us — including data from the Eranos relay and Eranos Blossom server — that may assist in investigations, in accordance with applicable law.
- Identify and share the specific relay URLs and file server URLs where offending content was observed, so law enforcement can contact those operators directly.
- Preserve any available evidence or information upon receiving a valid legal request.
- Report identified CSAE material to NCMEC and other relevant authorities proactively.

## Decentralized Architecture Considerations

Nostr's decentralized nature means that no single entity has complete control over all content on the network. {{appName}} acknowledges the following realities and our approach to each:

- **Full control over our own infrastructure:** We can and do remove content from the Eranos relay and Eranos Blossom server. CSAE material found on our infrastructure is deleted immediately and accounts are permanently banned.
- **Limited control over third-party relays:** We cannot delete content from third-party relays. However, we block such content from being displayed within our app through client-level filters and blocklists.
- **Users control their relay connections:** While users can connect to relays of their choice, {{appName}} reserves the right to block connections to relays known to host CSAE content.
- **Public keys are pseudonymous:** Nostr accounts are identified by cryptographic key pairs rather than verified identities. We will still block and report offending keys and cooperate with law enforcement to identify individuals behind them.

## Appeals

If you believe your content or account has been incorrectly flagged or blocked under this policy, you may contact us at [goblin.st/team](https://goblin.st/team) to request a review. We will evaluate appeals on a case-by-case basis. However, we err on the side of child safety in all decisions, and our determination is final.

## Changes to This Policy

We may update this child safety policy as our tools, processes, and the Nostr ecosystem evolve. Changes will be reflected on this page with an updated date. We are committed to continuously improving our ability to detect, prevent, and respond to CSAE content.

## Contact

For questions about this policy or to report CSAE content, contact the team behind {{appName}} at [goblin.st/team](https://goblin.st/team).
