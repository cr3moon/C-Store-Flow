# Synthetic Commander fixtures

**These are not real register data.** They were written by hand to match the shapes described in MyStore's field notes (`cr3moon/mystore` `docs/verifone-commander-*.md`). Element names follow those notes; values are invented.

They exist so the agent and parsers can be built and tested with no register. Once real captures are in `../real/`, every parser must pass against those too. Where the two disagree, the real capture wins and the synthetic file gets fixed.

| File | Mimics |
| --- | --- |
| `validate.xml` | `CGILink?cmd=validate` success |
| `fault.xml` | A Commander fault response |
| `periodlist.xml` | `CGILink?cmd=vtlogpdlist` (also served for `vreportpdlist`) |
| `transset-daily-2026-11-20.401.xml` | `CGILink?cmd=vtransset` for a closed DAILY |
| `transset-shift-2026-11-20.480.xml` | `CGILink?cmd=vtransset` for a closed SHIFT |
| `ruby-summary.xml` | `CGILink?cmd=vrubyrept&reptname=summary` |
| `ruby-tax.xml` | `CGILink?cmd=vrubyrept&reptname=tax` |
| `ruby-department.xml` | `CGILink?cmd=vrubyrept&reptname=department` |
| `ruby-network.xml` | `CGILink?cmd=vrubyrept&reptname=network` |

Expected values the tests check, from `transset-daily-2026-11-20.401.xml`:

- HIGH TAX taxable 3.19, tax 0.22 (one cash sale)
- LOW TAX taxable 2.00, tax 0.06 (one network sale)
- Excluded: the void, and the network sale that carries a `preFuel` line
- Two `trpCardInfo` elements to redact
