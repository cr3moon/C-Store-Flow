import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CommanderFault,
  findFault,
  isClosedPeriodFilename,
  parsePeriodList,
  parseRubySummary,
  parseRubyTax,
  parseTransSetSummary,
  parseValidate,
  redactCardData,
  SYNTHETIC_FIXTURES,
} from "../src";

const fixture = (name: string) => readFileSync(path.join(SYNTHETIC_FIXTURES, name), "utf8");

describe("validate and faults", () => {
  it("reads the cookie and allowed functions", () => {
    const cred = parseValidate(fixture("validate.xml"));
    expect(cred.cookie).toBe("SIMCOOKIE");
    expect(cred.functions).toContain("vtransset");
  });

  it("turns a fault into a CommanderFault", () => {
    expect(findFault(fixture("fault.xml"))).toBe("Invalid credential");
    expect(() => parseValidate(fixture("fault.xml"))).toThrow(CommanderFault);
  });
});

describe("period list", () => {
  it("lists SHIFT and DAILY periods with report parameters", () => {
    const periods = parsePeriodList(fixture("periodlist.xml"));
    expect(periods).toHaveLength(4);
    const daily = periods.find((p) => p.kind === "DAILY" && !p.isCurrent);
    expect(daily).toMatchObject({ filename: "2026-11-20.401", period: "2", sysid: "2" });
    expect(periods.filter((p) => p.isCurrent)).toHaveLength(2);
  });

  it("recognises closed period filenames", () => {
    expect(isClosedPeriodFilename("2026-07-17.312")).toBe(true);
    expect(isClosedPeriodFilename("current")).toBe(false);
  });
});

describe("transaction set", () => {
  const summary = parseTransSetSummary(fixture("transset-daily-2026-11-20.401.xml"));

  it("reads the envelope and confirms the day closed", () => {
    expect(summary).toMatchObject({ kind: "DAILY", businessDate: "2026-11-20", seq: "401", closed: true });
    expect(summary.periodSales.overallSales).toBe(2547);
  });

  it("counts transaction types", () => {
    expect(summary.transCounts).toMatchObject({ sale: 1, "network sale": 2, void: 1, periodClose: 2 });
  });

  it("applies the printed-report tax rule: no voids, no fuel prepay tickets", () => {
    expect(summary.taxBuckets).toEqual([
      { name: "HIGH TAX", taxable: 319, tax: 22 },
      { name: "LOW TAX", taxable: 200, tax: 6 },
    ]);
  });

  it("matches the Ruby tax report for the same day", () => {
    expect(parseRubyTax(fixture("ruby-tax.xml"))).toEqual(summary.taxBuckets);
  });
});

describe("Ruby summary", () => {
  it("reads fuelSales from the first totals block, not byRegister", () => {
    const ruby = parseRubySummary(fixture("ruby-summary.xml"));
    expect(ruby.fuelSales).toBe(2000);
    expect(ruby.outsideSalesDifference).toBe(1800);
    expect(ruby.methodsOfPayment.map((m) => m.name)).toEqual(["CASH", "CREDIT", "DEBIT"]);
  });
});

describe("card data redaction", () => {
  it("removes every trpCardInfo element and keeps everything else byte for byte", () => {
    const raw = Buffer.from(fixture("transset-daily-2026-11-20.401.xml"), "utf8");
    const { body, redactions } = redactCardData(raw);
    const text = body.toString("utf8");
    expect(redactions).toEqual(["trpCardInfo x 2"]);
    expect(text).not.toMatch(/4242|1111|SIM00\d|SIMHOST/);
    expect(text).toContain("<trpCardInfo redacted=\"true\"/>");
    // Totals still parse the same after redaction.
    expect(parseTransSetSummary(text).taxBuckets).toHaveLength(2);
  });

  it("leaves bodies without card data untouched", () => {
    const raw = Buffer.from(fixture("ruby-summary.xml"));
    const result = redactCardData(raw);
    expect(result.redactions).toEqual([]);
    expect(result.body).toBe(raw);
  });
});
