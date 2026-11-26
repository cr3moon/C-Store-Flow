/**
 * Money is integer cents everywhere. Never use floats for money.
 * Commander writes amounts as decimal strings like "6817.91" or "-4.12".
 */
export type Cents = number & { readonly __brand: "Cents" };

const DECIMAL = /^\s*([+-])?(\d+)(?:\.(\d+))?\s*$/;

/** Parse a decimal string into exact integer cents. Rounds half away from zero past 2 places. */
export function toCents(value: string | number | null | undefined): Cents {
  if (value === null || value === undefined || value === "") return 0 as Cents;
  const text = typeof value === "number" ? value.toFixed(6) : value;
  const match = DECIMAL.exec(text);
  if (!match) throw new Error(`Not a money amount: ${JSON.stringify(value)}`);
  const [, sign, whole = "0", fraction = ""] = match;
  const padded = (fraction + "000").slice(0, 3);
  let cents = Number(whole) * 100 + Number(padded.slice(0, 2));
  if (Number(padded[2]) >= 5) cents += 1;
  return (sign === "-" ? -cents : cents) as Cents;
}

export function addCents(...values: Cents[]): Cents {
  return values.reduce((sum, v) => sum + v, 0) as Cents;
}

/** "$1,234.56" or "-$4.12". */
export function formatCents(cents: Cents): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString("en-US");
  const rest = String(abs % 100).padStart(2, "0");
  return `${negative ? "-" : ""}$${dollars}.${rest}`;
}
