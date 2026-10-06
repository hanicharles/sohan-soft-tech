export class MoneyError extends Error {}
export function parseMoney(value: unknown): number {
  if (typeof value !== "string" || !/^\d{1,10}(\.\d{1,2})?$/.test(value.trim()))
    throw new MoneyError("Enter an amount with at most two decimal places.");
  const [whole, fraction = ""] = value.trim().split(".");
  return safeMoney(Number(whole) * 100 + Number(fraction.padEnd(2, "0")));
}
export function safeMoney(value: number): number {
  if (!Number.isSafeInteger(value) || Math.abs(value) > 999999999999)
    throw new MoneyError("Amount is outside the supported range.");
  return value;
}
export function percentage(amount: number, basisPoints: number): number {
  safeMoney(amount);
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10000)
    throw new MoneyError("Percentage must be between 0 and 100.");
  return Number(
    (BigInt(amount) * BigInt(basisPoints) + BigInt(5000)) / BigInt(10000),
  );
}
export function splitMoney(amount: number, count: number): number[] {
  if (!Number.isInteger(count) || count < 1 || count > 12)
    throw new MoneyError("Choose between 1 and 12 installments.");
  const base = Math.floor(safeMoney(amount) / count);
  return Array.from(
    { length: count },
    (_, i) => base + (i < amount % count ? 1 : 0),
  );
}
export const money = (paise: number | null | undefined, decimals = false) => {
  const precise = decimals || !!((paise ?? 0) % 100);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: precise ? 2 : 0,
    minimumFractionDigits: precise ? 2 : 0,
  }).format((paise ?? 0) / 100);
};
export function apportionMoney(amount: number, weights: number[]): number[] {
  safeMoney(amount);
  weights.forEach(safeMoney);
  const total = weights.reduce((s, n) => s + BigInt(n), BigInt(0));
  if (amount < 0 || weights.some((n) => n < 0) || total <= BigInt(0))
    throw new MoneyError("Positive component weights are required.");
  const portions = weights.map((n, i) => {
    const product = BigInt(amount) * BigInt(n);
    return { i, value: Number(product / total), remainder: product % total };
  });
  let remainder = amount - portions.reduce((s, n) => s + n.value, 0);
  for (const part of [...portions].sort((a, b) =>
    a.remainder === b.remainder
      ? a.i - b.i
      : a.remainder > b.remainder
        ? -1
        : 1,
  )) {
    if (remainder-- <= 0) break;
    part.value++;
  }
  return portions.map((p) => p.value);
}
export function lateFee(
  outstanding: number,
  dueDate: string,
  date: string,
  rule: { mode: string; value: number; graceDays: number; maxPaise: number },
  alreadyCharged = 0,
): number {
  const days =
    Math.floor((Date.parse(date) - Date.parse(dueDate)) / 86400000) -
    rule.graceDays;
  if (days <= 0 || outstanding <= 0) return 0;
  let total =
    rule.mode === "Daily"
      ? rule.value * days
      : rule.mode === "Percentage"
        ? percentage(outstanding, rule.value) * Math.ceil(days / 30)
        : rule.value;
  if (rule.maxPaise > 0) total = Math.min(total, rule.maxPaise);
  return Math.max(0, safeMoney(total) - alreadyCharged);
}
