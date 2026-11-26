# Gaps and stubs

Anything not truly working is listed here. Remove a line only when the thing works against the real store.

| Area | State | What closes it |
| --- | --- | --- |
| Commander fixtures | Synthetic, built from MyStore's notes. Shapes match the notes; values are invented | Real captures from the Van Buren Commander in `packages/commander/fixtures/real/` |
| Commander client against the real register | Never run here | Phase 2 first connection, with a view-only login |
| TLS certificate pinning | Checked before any request is sent; tested against a local self-signed HTTPS server. Not yet tried against the real Commander's certificate | First real connection |
| Windows and macOS | CI runs the tests on both, but the agent has not been installed on a real Windows or Mac PC | Phase 2 install at the store |
| `vtransset` parsing | Envelope, totals, ticket counts and tax buckets only. Lines, tenders and fuel detail are not parsed yet | Phase 2 |
| Card data redaction | Removes `trpCardInfo` elements by pattern. Needs checking against a real journal | First real `vtransset` capture |
| API storage | In-memory store. Postgres schema exists in `apps/api/migrations/` but is not wired | Phase 2 |
| People sign-in | None. Only agent keys | Phase 2 |
| Agent service installers (Windows, systemd, launchd) | Templates only, untested | Phase 2 |
| Web app | Status page only | Phase 2 (Home, Daily close) |
| Mobile app | Expo skeleton, not installed or built in CI | Phase 2 |
| Writes to the Commander (`uPLUs`) | Not implemented. Disabled by design | Phase 3 |
| Tank gauge | Not started | Phase 5 |
