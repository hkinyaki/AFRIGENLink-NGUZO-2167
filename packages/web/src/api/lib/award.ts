/**
 * Auto-fill award engine.
 *
 * A client posts a tender for `unitsNeeded`. Suppliers bid partial/full quantity
 * + a per-unit price. We accept the CHEAPEST bids until the quantity is filled,
 * then compute a single FLAT FAIR per-unit price all awarded suppliers settle at
 * (volume-weighted average of the awarded bids, rounded). Each awarded supplier
 * may have its units trimmed so the total exactly meets demand.
 */

export type AwardBid = {
  id: string;
  supplierId: string;
  unitsOffered: number;
  pricePerUnitTzs: number;
};

export type AwardLine = {
  bidId: string;
  supplierId: string;
  unitsAwarded: number;
  bidPricePerUnitTzs: number;
};

export type AwardResult = {
  filled: boolean;
  unitsNeeded: number;
  unitsAwarded: number;
  flatFairPricePerUnitTzs: number;
  lines: AwardLine[];
  declinedBidIds: string[];
};

export function computeAward(unitsNeeded: number, bids: AwardBid[]): AwardResult {
  // cheapest first; tie-break by earlier (already ordered) / larger offer
  const sorted = [...bids].sort(
    (a, b) => a.pricePerUnitTzs - b.pricePerUnitTzs || b.unitsOffered - a.unitsOffered
  );

  const lines: AwardLine[] = [];
  const declinedBidIds: string[] = [];
  let remaining = unitsNeeded;

  for (const b of sorted) {
    if (remaining <= 0) {
      declinedBidIds.push(b.id);
      continue;
    }
    const take = Math.min(b.unitsOffered, remaining);
    if (take <= 0) {
      declinedBidIds.push(b.id);
      continue;
    }
    lines.push({
      bidId: b.id,
      supplierId: b.supplierId,
      unitsAwarded: take,
      bidPricePerUnitTzs: b.pricePerUnitTzs,
    });
    remaining -= take;
  }

  const unitsAwarded = lines.reduce((s, l) => s + l.unitsAwarded, 0);
  const totalValue = lines.reduce((s, l) => s + l.unitsAwarded * l.bidPricePerUnitTzs, 0);
  const flat = unitsAwarded > 0 ? Math.round(totalValue / unitsAwarded) : 0;

  return {
    filled: remaining <= 0 && unitsAwarded === unitsNeeded,
    unitsNeeded,
    unitsAwarded,
    flatFairPricePerUnitTzs: flat,
    lines,
    declinedBidIds,
  };
}
