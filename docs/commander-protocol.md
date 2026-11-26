# Verifone Commander: what we know

Every fact here carries a status. Code may rely only on **observed** or **confirmed** facts. Anything else stays behind a flag until a real capture proves it.

| Status | Meaning |
| --- | --- |
| confirmed | Checked against an official Verifone document or a capture from the Van Buren Commander saved in `packages/commander/fixtures/real/` |
| observed | Seen working by MyStore against this store's Commander (source: `cr3moon/mystore` docs, July 2026). No capture in this repo yet |
| unconfirmed | Listed by the Commander (for example in the `validate` function list) but never exercised |

No official Verifone Commander or NAXML document is in either repo. Request them through the [Verifone back office partner program](https://verifone.cloud/petro-partners/back-office-partner-program/commander-site-controller).

## Connection

| Fact | Status |
| --- | --- |
| Commander answers HTTPS on the store LAN, default `https://192.168.31.11` | observed |
| Certificate is self-signed. The agent pins the certificate fingerprint on first connect instead of turning off TLS checks | observed (self-signed); pinning is our design |
| Login: `GET /cgi-bin/CGILink?cmd=validate&user=…&passwd=…` returns XML with `<cookie>…</cookie>` and the list of allowed functions | observed |
| Logout: `GET /cgi-bin/CGILink?cmd=releaseCredential&cookie=…`, always called after work, even on error | observed |
| A fault comes back as XML with `<message>` or `<e:message>` | observed |
| The `MANAGER` role cannot run `vdeptcfg` or view product codes | observed |

### Sharing the Commander

The existing MyStore / CR3 install logs in as `MANAGER` and must keep working. Until we know how many sessions the Commander allows at once:

- The agent uses its own login.
- It holds a session only for one batch of calls, then releases it.
- It never polls more often than once a minute.
- It backs off for 5 minutes after any login failure, so it cannot lock the account.

## Reads

| Call | Returns | Status |
| --- | --- | --- |
| `CGILink?cmd=vtlogpdlist` | `domain:periodList` of `periodInfo`: `vs:period@sysid` (1 SHIFT, 2 DAILY), `name` (`YYYY-MM-DD.seq` or `current`), `reportParameter[name=period|filename]` | observed |
| `CGILink?cmd=vtransset&filename=…&period=…` | `transSet` journal for one period: `startTotals`, a stream of `trans`, `endTotals`. Multi-MB | observed |
| `CGILink?cmd=vtranssetz` | Compressed form of the same | unconfirmed |
| `CGILink?cmd=vreportpdlist` | Period list for Ruby reports; same `filename` / `period` values, includes `current` | observed |
| `CGILink?cmd=vrubyrept&reptname=summary|tax|department|network&filename=…&period=…` | `pd:summaryPd`, `pd:taxPd`, `pd:departmentPd`, `pd:networkPd`. `reptname` is required | observed |
| `CGILink?cmd=vreportlist` | Names of available Ruby reports | observed |
| `NAXML` `cmd=vPLUs` with a `domain:PLUSelect` body | `domain:PLUs@page@ofPages` of `domain:PLU`. Page size up to 9999 accepted in one call | observed |
| `CGILink?cmd=vtaxratecfg`, `vfeecfg` | Tax rate and fee lists | observed |
| `vcashierrept`, `vfueltotals`, `vpayrollrept`, `vposjournal`, `vMovement`, `vtilleventreport` | Cashier, fuel, payroll, journal and movement reports | unconfirmed |

`vPLUs` details (observed): POST to `/cgi-bin/NAXML?`, `Content-Type: application/x-www-form-urlencoded`, body `cmd=vPLUs&cookie={cookie}` then a blank line then the `PLUSelect` XML. Namespace `urn:vfi-sapphire:np.domain.2001-07-01`. Filters: `<where kind="PLUNumber">`, `<where kind="PLUModifier">`, plus `<pageSize>` and `<page>`.

## Writes

Writes stay **off** in the agent until Phase 3 and need Moon's approval per change.

| Call | Use | Status |
| --- | --- | --- |
| `NAXML` `cmd=uPLUs` | Update PLUs. MyStore patched `price`, `description`, `SellUnit`, `department` inside the raw PLU XML so other tags survive, then re-read to confirm | observed |
| `cclosepdnow`, `cclosedaynow` | Close period / close day | unconfirmed. **Never called by the agent** |

## Matching the printed reports

These rules made MyStore's numbers match the register's printouts. They become the Phase 2 reconciliation tests.

| Printed line | Source | Status |
| --- | --- | --- |
| Fuel sales | Ruby `summary` → `summaryInfo.fuelSales`. Not `difference.outsideSales`, which runs lower | observed (DAILY 318: 6817.91) |
| HIGH TAX / LOW TAX taxable | Ruby `tax` first `<totals>` block, or sum `trTax/taxAmts/taxAmt[@cat]` on `sale` and `network sale` tickets, excluding voids and any ticket with a `preFuel` line | observed (DAILY 318: 959.66 / 842.15) |
| Tax collected | Same tickets, sum `taxNet[@cat]` | observed (DAILY 318: 67.19 + 25.30 = 92.49) |
| Department sales | Ruby `department` → `deptInfo` → `vs:deptBase` name and `netSales` | observed |
| Card network totals | Ruby `network` period `cardInfo`, ignoring `byRegister` copies | observed |

Traps:

- Parse only the first `<totals>` block in Ruby reports. Later blocks repeat by cashier and register.
- Prepaid fuel shows up twice: a `preFuel` deposit and a near-duplicate financial twin with the same `trSeq` and no `trUniqueSN`. De-duplicate before counting tickets.
- `department` on a PLU is a sysid code (for example `10`), not a name. Resolve names from the Ruby department report.
- UPCs come back with leading zeros. Store both the raw and the stripped form.
- Card data in `trpCardInfo` is masked, but the agent drops the whole `trpCardInfo` element before upload anyway. No card data leaves the store.

## Ingest rule

The agent uploads every Commander response **byte for byte** (gzip, SHA-256, content type, the call that produced it, store clock time). The cloud stores that raw layer forever and builds everything else from it. A parsing bug is then fixed by re-parsing, never by asking the register again.

The one exception is card data. `trpCardInfo` elements are removed from `vtransset` before the hash is taken, and the upload records that the redaction happened.
