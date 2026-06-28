/** Client-side mirror of the staged gate for the StageTracker UI. */
export const TENDER_STAGE_VIEW = [
  { key: "Bidding", short: "Bidding", actor: "supplier" },
  { key: "AwardConfirmed", short: "Awarded", actor: "supplier" },
  { key: "AgreementsSigned", short: "Agreements", actor: "supplier" },
  { key: "MachineDocsUploaded", short: "Fleet docs", actor: "field" },
  { key: "FieldVerified", short: "Inspected", actor: "client" },
  { key: "PermitsUploaded", short: "Permits", actor: "admin" },
  { key: "PermitsVerified", short: "Permits OK", actor: "client" },
  { key: "TTUploaded", short: "Payment", actor: "admin" },
  { key: "TTConfirmed", short: "Escrow", actor: "admin" },
  { key: "Executing", short: "Executing", actor: "none" },
  { key: "Completed", short: "Done", actor: "none" },
] as const;

export type StageKey = (typeof TENDER_STAGE_VIEW)[number]["key"];
