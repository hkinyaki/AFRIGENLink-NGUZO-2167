/**
 * Demand catalogue for posting a Job/Tender.
 * Client picks a demand type, then a specific carrier/machine type from these
 * lists, and types in the cargo/project description manually.
 */

export type DemandType = "CargoCarrier" | "Machinery";

export const DEMAND_TYPES: { value: DemandType; label: string; hint: string }[] = [
  { value: "CargoCarrier", label: "Cargo transport", hint: "Trucks to move cargo, materials or goods" },
  { value: "Machinery", label: "Machinery rental", hint: "Heavy equipment for a project or site" },
];

/** Cargo-carrier (truck) types found across East African corridors. */
export const CARGO_CARRIER_TYPES = [
  "Tipper Truck",
  "Flatbed Truck",
  "Low-Bed Trailer (Lowloader)",
  "Prime Mover + Semi-Trailer",
  "Container Truck (20ft)",
  "Container Truck (40ft)",
  "Tanker Truck (Fuel)",
  "Tanker Truck (Water)",
  "Bulk Cement Tanker",
  "Refrigerated Truck (Reefer)",
  "Box / Curtain-Side Truck",
  "Car Carrier",
  "Cattle / Livestock Truck",
  "General Cargo Truck",
] as const;

/** Heavy machinery / plant equipment types. */
export const MACHINERY_TYPES = [
  "Excavator",
  "Wheel Loader",
  "Backhoe Loader",
  "Bulldozer",
  "Motor Grader",
  "Compactor / Roller",
  "Mobile Crane",
  "Crawler Crane",
  "Concrete Mixer Truck",
  "Concrete Pump",
  "Drilling Rig",
  "Forklift",
  "Telehandler",
  "Skid-Steer Loader",
  "Dump Truck (Articulated)",
  "Asphalt Paver",
] as const;

export function typeOptions(demand: DemandType): readonly string[] {
  return demand === "CargoCarrier" ? CARGO_CARRIER_TYPES : MACHINERY_TYPES;
}

export const ROUTE_OPTIONS = [
  { value: "Domestic", label: "Domestic (within Tanzania)" },
  { value: "CrossBorder", label: "Cross-border (EAC corridor)" },
] as const;
