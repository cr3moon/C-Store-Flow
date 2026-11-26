# C-Store-Flow

Cloud back office for an independent gas station and convenience store on Verifone Ruby2 / Ruby Ci registers with a Commander site controller. Pilot store: Van Buren Food Express, Van Buren, Arkansas. Owner: Moon.

Goal: one system that replaces every back office the owner could buy (PDI, Petrosoft, CSympl, VeeCLI, CStoreIQ, easystorePRO), and is simpler than all of them. An owner runs the store from a phone in a few minutes a day.

Read before changing anything:

- `docs/discovery.md`: decisions, store facts, open questions, feature matrix, phase plan
- `docs/architecture.md`: components, data layers, repo layout
- `docs/commander-protocol.md`: everything known about the Commander, with a status on each fact
- `docs/gaps.md`: what is stubbed. Keep it current

## Ground rules

1. **Never guess a Verifone format.** Code may rely only on facts marked observed or confirmed in `docs/commander-protocol.md`. New facts need a capture in `packages/commander/fixtures/real/` or an official document.
2. **No fake features.** Anything not truly connected goes in `docs/gaps.md` and is labelled in the UI.
3. **The back office is never in the path of a sale.** The agent is read-only by default, holds one Commander session at a time, releases it after each batch, polls no faster than once a minute, and backs off after login failures. It never calls close-day or close-period.
4. **No card data leaves the store.** `trpCardInfo` is stripped before hashing. Never log passwords, cookies or card data.
5. **Nothing changes at the register without approval.** Writes (Phase 3) need `writesEnabled`, an approval id from the cloud, a diff preview, a read-back check and an undo.
6. **Every number traces to its source.** Raw captures are stored byte for byte and never edited. Clean and reporting data are rebuilt from them.
7. **Money is integer cents.** Use `toCents` from `@csf/core`. Never floats. Fuel volume is integer thousandths of a gallon.
8. **Plain English** in every label and error message.
9. **The existing MyStore / CR3 install at the store must keep working.** Don't use its login, don't lock the Commander.

## Layout

```txt
packages/core       shared types (zod), money helpers
packages/commander  Commander client, XML parsers, card redaction, simulator, fixtures
apps/agent          store agent: poller, SQLite queue, uploader, heartbeat, CLI
apps/api            Fastify API: agent heartbeat, capture ingest, store status
apps/web            React + Vite web app (status page so far)
apps/mobile         Expo app for iOS and Android (skeleton, outside the npm workspaces)
```

## Commands

```sh
npm install
npm run check        # typecheck + tests + web build. Run before every commit
npm run demo         # simulator → agent → API on one machine, synthetic data
npm run simulator    # fake Commander on :8180 (user AGENT, password sim)
npm run api          # API on :8080
npm run web          # web app on :5173
```

Node 22.13 or newer. TypeScript runs directly through `tsx` and Vitest; there is no build step for packages.

## Conventions

- Parsers read only the first `<totals>` block of Ruby reports; later blocks repeat by cashier or register.
- Tax buckets follow the printed-report rule: `sale` and `network sale` only, no voids, skip tickets with a `preFuel` line.
- Every new parser gets a test against a fixture. Once real captures exist, against those too.
- Synthetic fixtures carry a `SYNTHETIC` comment. Never present synthetic numbers as real.

## Where we are

Phase 1 (discovery + scaffold) is done. Phase 2 starts with the first real connection to the Van Buren Commander, using a view-only login of the agent's own, and saving the captures listed in `packages/commander/fixtures/real/README.md`.
