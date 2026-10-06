import { percentage, safeMoney, lateFee } from "./money";
export type FeeRule = {
  id: string;
  name: string;
  kind: "Discount" | "Scholarship";
  eligibility: "Sibling" | "All";
  minimumChildren?: number;
  calculation: "Fixed" | "Percentage";
  value: number;
  componentId?: string | null;
};
export function evaluateFeeRules(
  context: {
    items: { componentId: string; amountPaise: number }[];
    siblingCount: number;
  },
  rules: FeeRule[],
) {
  const gross = safeMoney(
    context.items.reduce((s, r) => s + safeMoney(r.amountPaise), 0),
  );
  let discount = 0,
    scholarship = 0;
  const applied: {
    id: string;
    name: string;
    amountPaise: number;
    kind: string;
  }[] = [];
  // Stable ordering and a per-component remainder prevent overlapping rules
  // from granting more than the component or invoice is worth.
  const remaining = new Map(
    context.items.map((i) => [i.componentId, i.amountPaise]),
  );
  for (const rule of rules) {
    if (
      rule.eligibility === "Sibling" &&
      context.siblingCount < (rule.minimumChildren || 2)
    )
      continue;
    const base = rule.componentId
      ? context.items.find((i) => i.componentId === rule.componentId)
          ?.amountPaise || 0
      : gross;
    const value = Math.max(
      0,
      Math.min(
        rule.componentId ? remaining.get(rule.componentId) || 0 : base,
        gross - discount - scholarship,
        rule.calculation === "Percentage"
          ? percentage(base, rule.value)
          : safeMoney(rule.value),
      ),
    );
    if (!value) continue;
    if (rule.componentId)
      remaining.set(
        rule.componentId,
        (remaining.get(rule.componentId) || 0) - value,
      );
    if (rule.kind === "Scholarship") scholarship += value;
    else discount += value;
    applied.push({
      id: rule.id,
      name: rule.name,
      amountPaise: value,
      kind: rule.kind,
    });
  }
  return {
    gross,
    discount,
    scholarship,
    net: gross - discount - scholarship,
    applied,
  };
}
export const accrueLateFee = lateFee;
