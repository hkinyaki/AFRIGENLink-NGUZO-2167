import { db } from "./database";
import { parts } from "./database/schema";
import { id } from "./lib/ids";

/**
 * Seeds the AFRIGEN emergency spare-parts catalog with realistic-illustrative data.
 * Run: cd packages/web && bun --env-file=../../.env src/api/seed.ts
 *
 * (Users/suppliers/contracts are created interactively via sign-up + demo flows.)
 */

const PARTS: (typeof parts.$inferInsert)[] = [
  {
    id: id("part"),
    partName: "Hydraulic Pump Assembly",
    compatibleModel: "320D / PC200 / R220",
    wholesaleCostTzs: 4_200_000,
    retailCostTzs: 5_600_000,
    darSupplierName: "Nyerere Rd Heavy Spares",
    darSupplierLocation: "Julius Nyerere Rd, Dar es Salaam",
    logisticsHandlingFeeTzs: 320_000,
  },
  {
    id: id("part"),
    partName: "Turbocharger Cartridge",
    compatibleModel: "FH16 / Actros 3340 / 320D",
    wholesaleCostTzs: 2_900_000,
    retailCostTzs: 3_950_000,
    darSupplierName: "Vingunguti Diesel Parts",
    darSupplierLocation: "Vingunguti Industrial Hub, Dar es Salaam",
    logisticsHandlingFeeTzs: 210_000,
  },
  {
    id: id("part"),
    partName: "Final Drive Sprocket Set",
    compatibleModel: "PC200 / D6R / 320D",
    wholesaleCostTzs: 6_100_000,
    retailCostTzs: 7_800_000,
    darSupplierName: "Nyerere Rd Heavy Spares",
    darSupplierLocation: "Julius Nyerere Rd, Dar es Salaam",
    logisticsHandlingFeeTzs: 480_000,
  },
  {
    id: id("part"),
    partName: "Air Brake Compressor",
    compatibleModel: "FH16 / Actros 3340 / Prime Mover",
    wholesaleCostTzs: 1_650_000,
    retailCostTzs: 2_250_000,
    darSupplierName: "Vingunguti Diesel Parts",
    darSupplierLocation: "Vingunguti Industrial Hub, Dar es Salaam",
    logisticsHandlingFeeTzs: 160_000,
  },
  {
    id: id("part"),
    partName: "Radiator Core (Heavy)",
    compatibleModel: "320D / D6R / Tipper",
    wholesaleCostTzs: 1_980_000,
    retailCostTzs: 2_700_000,
    darSupplierName: "Kariakoo Industrial Cooling",
    darSupplierLocation: "Julius Nyerere Rd, Dar es Salaam",
    logisticsHandlingFeeTzs: 190_000,
  },
  {
    id: id("part"),
    partName: "Injector Pump (Common Rail)",
    compatibleModel: "FH16 / Actros 3340 / 320D",
    wholesaleCostTzs: 3_400_000,
    retailCostTzs: 4_600_000,
    darSupplierName: "Vingunguti Diesel Parts",
    darSupplierLocation: "Vingunguti Industrial Hub, Dar es Salaam",
    logisticsHandlingFeeTzs: 240_000,
  },
  {
    id: id("part"),
    partName: "Track Roller (Undercarriage)",
    compatibleModel: "PC200 / D6R / 320D",
    wholesaleCostTzs: 980_000,
    retailCostTzs: 1_350_000,
    darSupplierName: "Nyerere Rd Heavy Spares",
    darSupplierLocation: "Julius Nyerere Rd, Dar es Salaam",
    logisticsHandlingFeeTzs: 120_000,
  },
  {
    id: id("part"),
    partName: "Clutch Plate Kit (Heavy)",
    compatibleModel: "FH16 / Actros 3340 / Prime Mover",
    wholesaleCostTzs: 1_420_000,
    retailCostTzs: 1_900_000,
    darSupplierName: "Vingunguti Diesel Parts",
    darSupplierLocation: "Vingunguti Industrial Hub, Dar es Salaam",
    logisticsHandlingFeeTzs: 150_000,
  },
];

async function main() {
  const existing = await db.select().from(parts).limit(1);
  if (existing.length) {
    console.log("Parts catalog already seeded — skipping.");
    return;
  }
  await db.insert(parts).values(PARTS);
  console.log(`Seeded ${PARTS.length} parts.`);
}

main().then(() => process.exit(0));
