/**
 * Staged approval gate for a Job/Tender. Each stage BLOCKS the next.
 * Order is strict — the tender can only advance one step at a time, and only
 * when the gating condition for the current step is satisfied.
 */

export const TENDER_STAGES = [
  "Bidding",
  "AwardConfirmed",
  "AgreementsSigned",
  "MachineDocsUploaded",
  "FieldVerified",
  "PermitsUploaded",
  "PermitsVerified",
  "TTUploaded",
  "TTConfirmed",
  "Executing",
  "Completed",
] as const;

export type TenderStage = (typeof TENDER_STAGES)[number];

export const STAGE_LABEL: Record<TenderStage, string> = {
  Bidding: "Bidding open",
  AwardConfirmed: "Awarded — agreements pending",
  AgreementsSigned: "Agreements signed",
  MachineDocsUploaded: "Machine docs uploaded",
  FieldVerified: "Field inspection verified",
  PermitsUploaded: "Permits uploaded",
  PermitsVerified: "Permits verified",
  TTUploaded: "Payment pending confirmation",
  TTConfirmed: "Escrow secured",
  Executing: "Approved — executing",
  Completed: "Completed",
};

/** Who is expected to act at each stage (UI hint). */
export const STAGE_ACTOR: Record<TenderStage, "client" | "supplier" | "field" | "admin" | "none"> = {
  Bidding: "supplier",
  AwardConfirmed: "supplier", // suppliers upload signed agreements
  AgreementsSigned: "supplier", // suppliers upload machine docs
  MachineDocsUploaded: "field", // field inspects
  FieldVerified: "client", // client uploads permits
  PermitsUploaded: "admin", // admin verifies permits
  PermitsVerified: "client", // client uploads TT proof
  TTUploaded: "admin", // admin confirms TT
  TTConfirmed: "admin", // admin approves execution
  Executing: "none",
  Completed: "none",
};

export function stageIndex(stage: string): number {
  const i = TENDER_STAGES.indexOf(stage as TenderStage);
  return i === -1 ? 0 : i;
}

export function nextStage(stage: string): TenderStage | null {
  const i = stageIndex(stage);
  return i < TENDER_STAGES.length - 1 ? TENDER_STAGES[i + 1] : null;
}

/** Is `target` exactly the next step after `current`? (strict, no skipping) */
export function isNextStage(current: string, target: string): boolean {
  return nextStage(current) === target;
}
