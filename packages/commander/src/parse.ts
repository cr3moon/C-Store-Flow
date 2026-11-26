import { XMLParser } from "fast-xml-parser";
import { type Cents, type PeriodKind, addCents, periodKindFromSysid, toCents } from "@csf/core";

/** Elements that can repeat. Always parsed as arrays so code never branches on count. */
const ARRAY_TAGS = new Set([
  "function",
  "periodInfo",
  "reportParameter",
  "trans",
  "trLine",
  "trPayline",
  "taxAmt",
  "taxNet",
  "taxRate",
  "taxInfo",
  "mopInfo",
  "totals",
  "PLU",
]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  // Keep every value as a string: money must not pass through floats,
  // and codes like "000" or "0001234567890" must keep their zeros.
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) => ARRAY_TAGS.has(name),
});

type Node = Record<string, unknown>;

export function parseXml(xml: string): Node {
  return parser.parse(xml) as Node;
}

export class CommanderFault extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommanderFault";
  }
}

function text(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && "#text" in (value as Node)) return String((value as Node)["#text"] ?? "");
  return String(value);
}

function attr(value: unknown, name: string): string {
  if (value && typeof value === "object") return text((value as Node)[`@_${name}`]);
  return "";
}

function arr<T = unknown>(value: unknown): T[] {
  if (value === undefined || value === null) return [];
  return (Array.isArray(value) ? value : [value]) as T[];
}

function node(value: unknown): Node {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Node) : {};
}

/** Returns the fault message if this response is a Commander fault, else null. */
export function findFault(xml: string): string | null {
  const doc = parseXml(xml);
  const fault = node(doc.fault);
  if ("message" in fault) return text(fault.message) || "Commander fault";
  if (Object.keys(fault).length > 0) return "Commander fault";
  return null;
}

export function assertNoFault(xml: string): void {
  const message = findFault(xml);
  if (message) throw new CommanderFault(message);
}

// ---------------------------------------------------------------- validate

export interface Credential {
  cookie: string;
  functions: string[];
}

export function parseValidate(xml: string): Credential {
  assertNoFault(xml);
  const doc = parseXml(xml);
  const credential = node(doc.credential);
  const cookie = text(credential.cookie);
  if (!cookie) throw new CommanderFault("Login response had no cookie");
  const functions = arr(node(credential.functions).function)
    .map((f) => text(node(f).cmd))
    .filter(Boolean);
  return { cookie, functions };
}

// ---------------------------------------------------------------- periods

export interface PeriodInfo {
  kind: PeriodKind;
  sysid: string;
  /** "2026-07-17.312" or "current". */
  filename: string;
  /** Report parameter "period": "1" or "2". */
  period: string;
  desc: string;
  isCurrent: boolean;
}

/** Parses vtlogpdlist and vreportpdlist. Unknown period types are skipped. */
export function parsePeriodList(xml: string): PeriodInfo[] {
  assertNoFault(xml);
  const list = node(parseXml(xml).periodList);
  const out: PeriodInfo[] = [];
  for (const raw of arr(list.periodInfo)) {
    const info = node(raw);
    const sysid = attr(info.period, "sysid");
    const kind = periodKindFromSysid(sysid);
    if (!kind) continue;
    const params: Record<string, string> = {};
    for (const p of arr(info.reportParameter)) params[attr(p, "name")] = text(p);
    const filename = params.filename ?? text(info.name);
    out.push({
      kind,
      sysid,
      filename,
      period: params.period ?? sysid,
      desc: text(info.desc),
      isCurrent: filename === "current",
    });
  }
  return out;
}

/** True for a closed period filename like "2026-07-17.312". */
export function isClosedPeriodFilename(filename: string): boolean {
  return /^\d{4}-\d{2}-\d{2}\.\d+$/.test(filename);
}

// ---------------------------------------------------------------- Ruby reports

export interface RubySummary {
  insideSales: Cents;
  /** Printed "Fuel sales". Use this, not difference.outsideSales. */
  fuelSales: Cents;
  totalSales: Cents;
  outsideSalesDifference: Cents;
  methodsOfPayment: { name: string; amount: Cents }[];
}

/** pd:summaryPd. Reads only the first <totals> block; later ones repeat by register/cashier. */
export function parseRubySummary(xml: string): RubySummary {
  assertNoFault(xml);
  const pd = node(parseXml(xml).summaryPd);
  const totals = node(arr(pd.totals)[0]);
  const info = node(totals.summaryInfo);
  return {
    insideSales: toCents(text(info.insideSales)),
    fuelSales: toCents(text(info.fuelSales)),
    totalSales: toCents(text(info.totalSales)),
    outsideSalesDifference: toCents(text(node(totals.difference).outsideSales)),
    methodsOfPayment: arr(info.mopInfo).map((m) => ({
      name: text(node(m).mopName),
      amount: toCents(text(node(m).amount)),
    })),
  };
}

export interface TaxBucket {
  name: string;
  taxable: Cents;
  tax: Cents;
}

function mergeBuckets(rows: TaxBucket[]): TaxBucket[] {
  const byName = new Map<string, TaxBucket>();
  for (const row of rows) {
    if (row.taxable === 0 && row.tax === 0) continue; // zero-rate duplicate rows
    const prev = byName.get(row.name);
    byName.set(
      row.name,
      prev
        ? { name: row.name, taxable: addCents(prev.taxable, row.taxable), tax: addCents(prev.tax, row.tax) }
        : row,
    );
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** pd:taxPd. First <totals> block only; zero duplicate rows ignored. */
export function parseRubyTax(xml: string): TaxBucket[] {
  assertNoFault(xml);
  const pd = node(parseXml(xml).taxPd);
  const totals = node(arr(pd.totals)[0]);
  return mergeBuckets(
    arr(totals.taxInfo).map((t) => {
      const info = node(t);
      return {
        name: attr(info.taxrateBase, "name"),
        taxable: toCents(text(info.taxableSales)),
        tax: toCents(text(info.netTax)),
      };
    }),
  );
}

// ---------------------------------------------------------------- transaction set

export interface SalesTotals {
  insideSales: Cents;
  outsideSales: Cents;
  overallSales: Cents;
}

export interface TransSetSummary {
  kind: PeriodKind;
  businessDate: string;
  seq: string;
  site: string;
  openedTime: string;
  closedTime: string;
  /** A periodClose for this period's own type and seq is present. */
  closed: boolean;
  startTotals: SalesTotals;
  endTotals: SalesTotals;
  /** endTotals - startTotals. */
  periodSales: SalesTotals;
  transCounts: Record<string, number>;
  /**
   * Taxable base and tax collected per bucket, by the rule that matched the
   * printed day close in MyStore: sale + network sale only, no voids, and skip
   * any ticket with a preFuel line.
   */
  taxBuckets: TaxBucket[];
}

function totals(value: unknown): SalesTotals {
  const t = node(value);
  return {
    insideSales: toCents(text(t.insideSales)),
    outsideSales: toCents(text(t.outsideSales)),
    overallSales: toCents(text(t.overallSales)),
  };
}

const TAXED_TYPES = new Set(["sale", "network sale"]);

export function parseTransSetSummary(xml: string): TransSetSummary {
  assertNoFault(xml);
  const set = node(parseXml(xml).transSet);
  const kind = periodKindFromSysid(attr(set, "periodID"));
  if (!kind) throw new Error(`Unknown transSet periodID ${attr(set, "periodID")}`);
  const seq = attr(set, "shortId");

  const transCounts: Record<string, number> = {};
  const rows: TaxBucket[] = [];
  let closed = false;

  for (const raw of arr(set.trans)) {
    const trans = node(raw);
    const type = attr(trans, "type");
    transCounts[type] = (transCounts[type] ?? 0) + 1;

    if (type === "periodClose" && text(trans.periodName) === kind && text(trans.periodSeq) === seq) {
      closed = true;
    }

    if (!TAXED_TYPES.has(type)) continue;
    const lines = arr(node(trans.trLines).trLine);
    if (lines.some((l) => attr(l, "type") === "preFuel")) continue;

    const amts = node(node(node(trans.trValue).trTax).taxAmts);
    const taxNets = new Map(arr(amts.taxNet).map((n) => [attr(n, "cat"), toCents(text(n))]));
    for (const amt of arr(amts.taxAmt)) {
      const cat = attr(amt, "cat");
      rows.push({ name: cat, taxable: toCents(text(amt)), tax: taxNets.get(cat) ?? (0 as Cents) });
    }
  }

  const start = totals(set.startTotals);
  const end = totals(set.endTotals);
  return {
    kind,
    businessDate: attr(set, "longId"),
    seq,
    site: attr(set, "site"),
    openedTime: text(set.openedTime),
    closedTime: text(set.closedTime),
    closed,
    startTotals: start,
    endTotals: end,
    periodSales: {
      insideSales: (end.insideSales - start.insideSales) as Cents,
      outsideSales: (end.outsideSales - start.outsideSales) as Cents,
      overallSales: (end.overallSales - start.overallSales) as Cents,
    },
    transCounts,
    taxBuckets: mergeBuckets(rows),
  };
}
