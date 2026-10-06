export const denominations = [500, 200, 100, 50, 20, 10, 5, 2, 1] as const;
export function countedCash(counts: Record<string, number>): number {
  let total = 0;
  for (const [value, count] of Object.entries(counts)) {
    if (
      !denominations.includes(Number(value) as any) ||
      !Number.isSafeInteger(count) ||
      count < 0 ||
      count > 1000000
    )
      throw new Error("Enter whole, non-negative currency counts.");
    total += Number(value) * 100 * count;
  }
  if (!Number.isSafeInteger(total) || total > 999999999999)
    throw new Error("Cash count exceeds the supported amount.");
  return total;
}
