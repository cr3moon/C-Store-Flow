import { describe, expect, it } from "vitest";
import { addCents, formatCents, toCents } from "../src";

describe("toCents", () => {
  it("parses Commander decimal strings exactly", () => {
    expect(toCents("6817.91")).toBe(681791);
    expect(toCents("0.22")).toBe(22);
    expect(toCents("-4.12")).toBe(-412);
    expect(toCents("300")).toBe(30000);
    expect(toCents("7.000")).toBe(700);
  });

  it("rounds half away from zero past two places", () => {
    expect(toCents("1.005")).toBe(101);
    expect(toCents("-1.005")).toBe(-101);
    expect(toCents("1.004")).toBe(100);
  });

  it("treats empty as zero and rejects junk", () => {
    expect(toCents("")).toBe(0);
    expect(toCents(undefined)).toBe(0);
    expect(() => toCents("abc")).toThrow();
  });

  it("does not drift when summing many amounts", () => {
    const total = addCents(...Array.from({ length: 1000 }, () => toCents("0.10")));
    expect(total).toBe(10000);
  });
});

describe("formatCents", () => {
  it("formats for people", () => {
    expect(formatCents(toCents("3206.40"))).toBe("$3,206.40");
    expect(formatCents(toCents("-4.12"))).toBe("-$4.12");
  });
});
