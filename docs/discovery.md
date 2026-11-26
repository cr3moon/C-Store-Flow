# Phase 1 discovery

Status as of 2026-11-25. Pilot store: Van Buren Food Express, Van Buren, Arkansas.

C-Store-Flow is a fresh TypeScript build of a cloud back office for an independent gas station running Verifone Ruby2 / Ruby Ci registers on a Commander site controller. It reuses what the earlier MyStore project proved about talking to the Commander and starts everything else clean.

## Decisions made

| Decision | Choice | Why |
| --- | --- | --- |
| Relationship to MyStore (`cr3moon/mystore`) | Fresh build, reuse proven lessons | MyStore's Commander notes are real field evidence; its app code was reconstructed and is not carried over |
| Stack | TypeScript everywhere | One language for the store agent, API, web and phone apps; shared types between them |
| Store agent platforms | Windows, Linux, macOS | One Node program, installed as a background service on each |
| Phone apps | Native iOS and Android | React Native (Expo), published to the App Store and Google Play |
| Cloud database | Postgres | Reporting queries, row-level isolation per store, mature hosting |
| Accounting | Exports only | The accountant handles the books; no QuickBooks connection for now |

## Store facts

Known:

- Verifone Ruby2 / Ruby Ci registers on a Commander site controller.
- Commander LAN address seen in MyStore: `192.168.31.11`. The login MyStore used is `MANAGER`.
- Commander periods on this site are SHIFT (sysid 1) and DAILY (sysid 2). No monthly period appears in the saved period list.
- Two tax buckets ring at the register: HIGH TAX at 7.000% and LOW TAX at 3.000%.
- Fuel: there is a tank gauge on the store network. Grades and tank count are still open (below).
- Lottery: Arkansas Scholarship Lottery. Lotto rings to a department (dept 35 in the MyStore sample).
- Tobacco scan-data programs: enrolled.
- Foodservice: yes.
- Live bait: crappie and bass minnows.
- Vendors seen in MyStore's cost slots: 101, Sam's Club, Global, Hackney, Gandhi.
- An existing local MyStore / CR3 install reads the Commander today and must keep working. The new agent must not lock it out (see [commander-protocol.md](commander-protocol.md#sharing-the-commander)).

Open questions (blocking only the phase listed):

| Question | Needed by |
| --- | --- |
| Commander software base version | Phase 2 |
| A Commander login for the agent, separate from `MANAGER`, with view-only rights | Phase 2 |
| Real captures: one closed DAILY `vtransset`, one SHIFT `vtransset`, `vtlogpdlist`, `vreportpdlist`, and Ruby `summary`, `tax`, `department`, `network` for the same day | Phase 2 |
| Fuel grades, number of tanks and fueling positions | Phase 5 |
| Tank gauge make and model, and its network address | Phase 5 |
| Price sign make, or manual | Phase 5 |
| Card processor and network (MyStore samples show a `ShellPayment` host) | Phase 2 |
| Fuel supplier, and whether the store is branded | Phase 5 |
| Which tobacco programs (Altria, RJR, ITG) and the account numbers' format | Phase 6 |
| Payroll provider, if any | Phase 7 |
| Number of registers, employees and shifts per day | Phase 2 |

## Feature matrix

A check means the product lists that feature on its own site or app listing (PDI: from its review-site listings). A blank means it was not listed, not that the product lacks it. StoreDesk had no public listing; `cr3moon/StoreDesk` exists on your GitHub. If that is the reference, point me at it.

| Area | PDI CStore Essentials | Petrosoft CStoreOffice + Retail360 | CSympl | VeeCLI | CStoreIQ | easystorePRO | C-Store-Flow phase |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Live sales dashboard | ✓ | ✓ | ✓ (Pro) | ✓ | ✓ | ✓ | 2 |
| Guided daily close, cash over/short | | ✓ | | ✓ | | ✓ | 2 |
| Price book edit from phone | ✓ | ✓ | ✓ | | ✓ | ✓ | 3 |
| Unscanned / not-found items queue | | | ✓ | | | | 3 |
| Scheduled price changes | | | ✓ | | | | 3 |
| Group pricing, one-touch update | | ✓ (price zones) | ✓ | | | | 3 |
| Promotions, mix-and-match | | ✓ | ✓ | | ✓ | ✓ | 3 |
| Shelf tags and labels | | ✓ | ✓ | | | | 3 |
| Margin vs target | ✓ | ✓ | ✓ | | | | 3 |
| Item-level inventory, counts, shrink | ✓ | ✓ | ✓ | | | ✓ | 4 |
| Suggested orders, purchase orders | ✓ | ✓ | | | | | 4 |
| EDI invoices | | ✓ | | | | | 4 |
| Photo invoices | | ✓ (24–36 h turnaround) | | | | soon | 4 (same day, AI) |
| Vendor cost-change alerts | | ✓ | | | | | 4 |
| Tank levels from gauge | | ✓ | | ✓ | | ✓ | 5 |
| Fuel book-to-physical reconciliation | | ✓ | | | | | 5 |
| Fuel price changes to pumps | | ✓ | ✓ | | ✓ | ✓ | 5 |
| Competitor fuel prices | | ✓ | | | | | 5 |
| Price sign push | | ✓ (add-on) | | | | | 5 |
| Lottery packs and settlement | ✓ | ✓ | | ✓ | ✓ | | 6 |
| Tobacco scan data | | ✓ (add-on) | | | | | 6 |
| Loss prevention / void analytics | | ✓ (separate product) | | | | | 6 |
| Time clock, timesheets | ✓ | | | | | | 7 |
| Payroll reports | | | | | | ✓ | 7 |
| Accounting / GL | | ✓ | | | | | 7 (exports only) |
| Bank balances and transactions | | ✓ | | ✓ | | | 7 |
| License and permit renewal alerts | | | | ✓ | | | 7 |
| Loyalty | ✓ | | | | | | 7 |
| Multi-store | ✓ | ✓ | | ✓ | ✓ | ✓ | 9 |
| Role-based access, audit log | | ✓ | | ✓ | | | 2 |
| Open API | | ✓ | | | | | 2 |
| AI assistant connection (MCP) | | ✓ (beta) | | | | | 8 |
| Live bait tracking | | | | | | | 7 |
| Plain-English questions about the store | | | | | | | 8 |
| Explanations for unusual numbers | | | | | | | 8 |
| Money-left-on-the-table finder (rebates, overcharges) | | | | | | | 8 |

What the matrix says:

- Petrosoft is the most complete. It is also the one to beat on simplicity: 250+ reports, add-ons sold separately, and a day or more to process photo invoices.
- The phone-first apps (CSympl, VeeCLI, CStoreIQ, easystorePRO) each cover a slice. CSympl is strongest on price book; VeeCLI on shift, tanks and lottery.
- No one lists live bait, plain-English questions, explanations for unusual numbers, or a finder for missed rebates and overcharges. Those are C-Store-Flow's openings.
- Every listed competitor that names a register supports Verifone Commander. Commander support is table stakes, not a differentiator.

Complaints to design around:

- PDI CStore Essentials is rated 2.0 out of 5 on Capterra (3 reviews). One reviewer said it "added at least an hour of work to my plate everyday and we can never find anything that we need." Lesson: search on every screen, two taps to anything.
- CStoreOffice is rated 3.8 out of 5 (33 reviews). Its own marketing quotes owners spending hours a day on paperwork. Lesson: the daily close must be a few minutes, mostly automatic.

## Phase plan

| Phase | Delivers | Finish line |
| --- | --- | --- |
| 1 Discovery | This doc, architecture, Commander notes, repo scaffold, store agent skeleton | Approved by Moon |
| 2 Foundation | Agent reads periods and reports from the real Commander; raw capture in the cloud; sign-in; Home and Daily close | Day totals match the printed day close to the penny for 7 days |
| 3 Price book | Two-way item sync, promotions, labels, approval and undo | An approved change shows at the register and rolls back |
| 4 Goods | Invoices (photo, EDI), purchasing, inventory | Invoice lines match items; cost changes flagged |
| 5 Fuel | Tank gauge, deliveries, reconciliation, pricing | Book vs tank variance within gauge tolerance |
| 6 Control | Lottery, tobacco scan data, loss prevention | Scan file passes each program's validator |
| 7 Business | Employees, exports for the accountant, compliance, bait, foodservice, customers, maintenance | Accountant accepts the monthly export |
| 8 Intelligence | Ask the store, morning brief, explanations, suggestions | Answers cite their source numbers |
| 9 Hardening | Security review, load test, multi-store, App Store and Google Play release | Public release |

## Sources

- [PDI CStore Essentials on Capterra](https://www.capterra.com/p/145882/PDI-Retail-Suite/) and [GetApp](https://www.getapp.com/all-software/a/pdi-cstore-essentials/)
- [Petrosoft CStoreOffice features](https://petrosoftinc.com/c-store-office), [Retail360 app](https://apps.apple.com/us/app/retail360/id1523047598), [CStoreOffice on Capterra](https://capterra.com/p/119847/C-Store-Office/)
- [CSympl on the App Store](https://apps.apple.com/bs/app/csympl/id1521144086)
- [VeeCLI on the App Store](https://apps.apple.com/us/app/veecli/id1518816103)
- [CStoreIQ on the App Store](https://apps.apple.com/ca/app/cstoreiq/id1622375461)
- [easystorePRO on the App Store](https://apps.apple.com/us/app/easystorepro/id1523931030)
- [Petrosoft: Verifone Commander connection](https://help.petrosoftinc.com/Content/Cash_Register_Connections/cr_installation/verifone_commander_installation.htm)
- [Verifone back office partner program: Commander site controller](https://verifone.cloud/petro-partners/back-office-partner-program/commander-site-controller)
- MyStore field notes: `cr3moon/mystore` `docs/verifone-commander-price-book.md` and `docs/verifone-commander-reports.md`
