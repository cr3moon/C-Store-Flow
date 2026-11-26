/**
 * Removes card data from Commander responses before they are stored or sent.
 * Works on the body as latin1 text so every other byte is kept exactly.
 *
 * Commander already masks card numbers, but the whole trpCardInfo element
 * (masked account, auth code, host, batch) is dropped anyway: the back office
 * never needs it, and it keeps the system out of PCI scope.
 */
const CARD_INFO = /<(?:[\w-]+:)?trpCardInfo\b[^>]*?(?:\/>|>[\s\S]*?<\/(?:[\w-]+:)?trpCardInfo\s*>)/g;

export interface RedactionResult {
  body: Buffer;
  redactions: string[];
}

export function redactCardData(body: Buffer): RedactionResult {
  const text = body.toString("latin1");
  let count = 0;
  const cleaned = text.replace(CARD_INFO, () => {
    count += 1;
    return "<trpCardInfo redacted=\"true\"/>";
  });
  if (count === 0) return { body, redactions: [] };
  return { body: Buffer.from(cleaned, "latin1"), redactions: [`trpCardInfo x ${count}`] };
}
