---
name: merge-upstream
description: Merge upstream changes from the Ditto repo (which Agora is a fork of) into Agora's main branch. Load when the user asks to "merge upstream", "pull from Ditto", "sync with Ditto", or otherwise update Agora with new commits from soapbox-pub/ditto.
---

# Merge Upstream from Ditto

Agora is a fork of [Ditto](https://gitlab.com/soapbox-pub/ditto). This skill walks through pulling new commits from upstream Ditto and merging them into Agora's `main` branch, while making philosophy-aware decisions on merge conflicts.

## Philosophy: Agora vs. Ditto

Agora has diverged from Ditto on purpose in several areas. When resolving conflicts, side with Agora's direction unless the upstream change is clearly a generic bug fix or improvement that applies to both. Known divergences:

- **No Blobbi** — Agora has removed Blobbi support. If an upstream change adds or modifies Blobbi-related code, prefer to drop the Blobbi parts rather than reintroduce them.
- **Lightning-only wallet** — Agora uses a Breeze Lightning wallet. **No onchain functionality exists in Agora**, even though Ditto includes it. Reject upstream onchain wallet code; keep onchain-related conflicts resolved to Agora's Lightning-only path.
- **General rule** — if upstream reintroduces a feature Agora deliberately removed, the deliberate removal wins. When in doubt, ask the user before resolving a conflict that touches a known divergence.

Spend a moment scanning the conflict for these themes before mechanically resolving line-by-line.

## Procedure

### Step 1: Ensure the `ditto` remote exists

Check the current remotes:

```bash
git remote -v
```

If `ditto` is not listed (pointing to `https://gitlab.com/soapbox-pub/ditto.git` or the equivalent `git@gitlab.com:soapbox-pub/ditto.git`), add it:

```bash
git remote add ditto https://gitlab.com/soapbox-pub/ditto.git
```

If a `ditto` remote exists but points elsewhere, fix it with `git remote set-url ditto <url>`.

### Step 2: Confirm a clean working tree on `main`

```bash
git status
git branch --show-current
```

The working tree must be clean and the current branch must be `main`. If not, stop and ask the user how to proceed — do not stash or switch branches automatically.

### Step 3: Fetch from Ditto

```bash
git fetch ditto
```

### Step 4: Preview what's incoming

Show the user (or at least review yourself) the commits that will be merged before merging:

```bash
git log --oneline main..ditto/main
```

If the list is empty, Agora is already up to date — stop here and tell the user.

### Step 5: Merge `ditto/main` into `main`

```bash
git merge ditto/main
```

If the merge succeeds without conflicts, proceed to Step 7.

### Step 6: Resolve conflicts (if any)

For each conflicted file:

1. Re-read the Philosophy section above.
2. Inspect the conflict with `git diff` and decide based on Agora's direction, not just textual merge.
3. For Blobbi-related conflicts, drop the Blobbi side.
4. For onchain-wallet conflicts, keep Agora's Lightning-only path.
5. For ambiguous cases that touch a known divergence, **ask the user** before resolving.
6. After resolving each file, `git add <file>`.

When all conflicts are resolved, complete the merge:

```bash
git commit
```

Git will pre-populate a merge commit message listing the conflicted files. Keep that information and add a short note about how non-trivial conflicts were resolved (especially anything touching the divergences above), so the resolution rationale is preserved in history.

### Step 7: Validate the merge

Run the full test script to confirm the merged tree still type-checks, lints, tests, and builds:

```bash
npm run test
```

If anything fails, fix it before declaring the merge done. Failures after an upstream merge are common — a removed Blobbi reference may now be re-imported by new upstream code, or onchain wallet types may leak into Lightning-only code paths. Fix forward in new commits on top of the merge commit; do not amend the merge commit itself.

### Step 8: Report back

Tell the user:

- How many commits were merged (`git rev-list --count main@{1}..main`).
- Which files had conflicts and how each was resolved.
- Whether `npm run test` passed.
- That the merge is **not** pushed — the user decides when to push.

**Do not push to `origin` automatically.** The user will push when they're ready.
