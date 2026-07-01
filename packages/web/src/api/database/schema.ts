import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema";

// Re-export Better Auth tables so drizzle picks them up
export * from "./auth-schema";

const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

/**
 * profile — app-level role + verification data, keyed to Better Auth user.id
 * roles: admin | client | supplier | field
 */
export const profile = sqliteTable("profile", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  // admin | key_account | client | supplier | field | parts_supplier
  role: text("role").notNull().default("client"),
  userCode: text("user_code").default(""), // human-readable ID e.g. AGL-FA-007 (unique per row)
  username: text("username").notNull().default(""), // admin-set login username for staff (Field/KAM/Parts/Admin)
  companyName: text("company_name").notNull().default(""),
  // PendingOnboarding | Submitted | SiteVisitScheduled | Verified | Rejected
  verificationStatus: text("verification_status").notNull().default("PendingOnboarding"),
  physicalVerificationNotes: text("physical_verification_notes").default(""),
  phone: text("phone").default(""),
  // --- staff / field-agent personal profile (sender ID) ---
  fullName: text("full_name").notNull().default(""),
  agentNumber: text("agent_number").notNull().default(""), // short staff ID e.g. FA-014
  photoKey: text("photo_key").notNull().default(""), // S3 key for profile image
  managerId: text("manager_id").notNull().default(""), // KAM (profile.id) this supplier/parts/field reports to
  // --- onboarding / KYC-KYB gate ---
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(false),
  onboardingComplete: integer("onboarding_complete", { mode: "boolean" }).notNull().default(false),
  onboardingStep: text("onboarding_step").notNull().default(""), // last saved wizard step
  fieldStation: text("field_station").notNull().default(""), // yard | border | "" (field agents only)
  // KYC (staff + responsible authoriser)
  nationalId: text("national_id").notNull().default(""),
  nationalIdDocKey: text("national_id_doc_key").notNull().default(""), // S3 key
  faceImageKey: text("face_image_key").notNull().default(""), // S3 key
  address: text("address").notNull().default(""), // office location / address (client remote verification)
  authoriserName: text("authoriser_name").notNull().default(""),
  authoriserTitle: text("authoriser_title").notNull().default(""),
  authoriserPhone: text("authoriser_phone").notNull().default(""),
  // KYB (company)
  companyRegNo: text("company_reg_no").notNull().default(""),
  companyTin: text("company_tin").notNull().default(""),
  companySector: text("company_sector").notNull().default(""),
  // --- supplier banking (used by KAM at payout) ---
  bankName: text("bank_name").notNull().default(""),
  bankAccountName: text("bank_account_name").notNull().default(""),
  bankAccountNo: text("bank_account_no").notNull().default(""),
  bankSwift: text("bank_swift").notNull().default(""),
  bankBranch: text("bank_branch").notNull().default(""),
  // --- KYB company logo (mandatory at onboarding for company accounts) ---
  logoKey: text("logo_key").notNull().default(""), // S3 key
  // --- KAM activity / presence ---
  kamActivityStatus: text("kam_activity_status").notNull().default("offline"), // online | offline | meeting | standby (manual overrides)
  lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }), // heartbeat for auto online/offline
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
});

/** supportTickets — help-desk live chat (CL/SUP/PS → assigned KAM, 1:1) */
export const supportTickets = sqliteTable("support_tickets", {
  id: text("id").primaryKey(),
  openerProfileId: text("opener_profile_id").notNull(),
  assignedKamId: text("assigned_kam_id").notNull().default(""), // KAM (or admin fallback) handling it
  topic: text("topic").notNull().default(""),
  urgency: text("urgency").notNull().default("Normal"), // Low | Normal | High
  botComplete: integer("bot_complete", { mode: "boolean" }).notNull().default(false), // bot intake finished → live chat
  status: text("status").notNull().default("Open"), // Open | Closed
  lastMessageAt: integer("last_message_at", { mode: "timestamp_ms" }),
  closedAt: integer("closed_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
});

/** chatMessages — used by BOTH help-desk tickets (ticketId) and contract/tender rooms (tenderId) */
export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(),
  ticketId: text("ticket_id").default(""), // help-desk scope
  tenderId: text("tender_id").default(""), // contract/tender room scope
  fromProfileId: text("from_profile_id").notNull().default(""), // "" for bot/system
  kind: text("kind").notNull().default("user"), // bot | user | system
  body: text("body").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
});

/** chatParticipants — who is in a contract/tender multi-party room */
export const chatParticipants = sqliteTable("chat_participants", {
  id: text("id").primaryKey(),
  tenderId: text("tender_id").default(""),
  ticketId: text("ticket_id").default(""),
  profileId: text("profile_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
});

/** idCounters — sequential per-role counter for issuing userCode atomically */
export const idCounters = sqliteTable("id_counters", {
  role: text("role").primaryKey(),
  seq: integer("seq").notNull().default(0),
});

/** staffRequests — KAM → Admin field-agent add requests */
export const staffRequests = sqliteTable("staff_requests", {
  id: text("id").primaryKey(),
  requestedByProfileId: text("requested_by_profile_id").notNull(), // KAM
  proposedName: text("proposed_name").notNull().default(""),
  proposedEmail: text("proposed_email").notNull().default(""),
  proposedPhone: text("proposed_phone").notNull().default(""),
  status: text("status").notNull().default("Pending"), // Pending | Approved | Rejected
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
});

/** kybDocuments — company KYB documents uploaded during onboarding (viewable on demand) */
export const kybDocuments = sqliteTable("kyb_documents", {
  id: text("id").primaryKey(),
  profileId: text("profile_id").notNull(),
  kind: text("kind").notNull().default("Other"), // Registration | TIN | Licence | Other
  fileKey: text("file_key").notNull().default(""), // S3 object key
  label: text("label").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
});

/** assets — Machinery & Fleets */
export const assets = sqliteTable("assets", {
  id: text("id").primaryKey(),
  supplierId: text("supplier_id").notNull(), // profile.id of supplier
  assetType: text("asset_type").notNull(), // Excavator | Prime Mover | Tipper Truck | Bulldozer | Cargo Truck
  manufacturer: text("manufacturer").notNull().default(""),
  model: text("model").notNull().default(""),
  vinChassis: text("vin_chassis").default(""),
  engineSerial: text("engine_serial").default(""),
  dayRateTzs: integer("day_rate_tzs").notNull().default(0),
  operationalStatus: text("operational_status").notNull().default("Available"), // Available | Active | Maintenance | Breakdown
  yardLocation: text("yard_location").notNull().default(""),
  photos: text("photos", { mode: "json" }).$type<string[]>().default([]),
  auditTimestamp: integer("audit_timestamp", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
});

/**
 * tenders — parent Job/Tender (quantity-demand procurement)
 * A client posts a demand for N units of a carrier/machine type; suppliers bid
 * partial/full quantity; system auto-fills cheapest bids until N is met at a
 * flat fair price; each awarded supplier gets one contract (below) under this tender.
 *
 * tenderStage (drives the staged approval gate):
 *  Bidding | AwardConfirmed | AgreementsSigned | MachineDocsUploaded
 *  | FieldVerified | PermitsUploaded | PermitsVerified | TTUploaded | TTConfirmed | Executing | Completed
 */
export const tenders = sqliteTable("tenders", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  title: text("title").notNull().default(""),
  demandType: text("demand_type").notNull().default("Machinery"), // CargoCarrier | Machinery
  carrierOrMachineType: text("carrier_or_machine_type").notNull().default(""), // chosen from dropdown
  cargoOrProjectDesc: text("cargo_or_project_desc").notNull().default(""), // free-text
  unitsNeeded: integer("units_needed").notNull().default(1),
  routeClassification: text("route_classification").notNull().default("Domestic"), // Domestic | CrossBorder
  origin: text("origin").notNull().default(""),
  destination: text("destination").notNull().default(""),
  flatFairPriceTzs: integer("flat_fair_price_tzs").notNull().default(0), // per-unit blended fair price at award
  // --- Timing ---
  // Cargo: when it must move + estimated transit days
  needByDate: text("need_by_date").notNull().default(""), // ISO YYYY-MM-DD
  transitDays: integer("transit_days").notNull().default(0),
  // Machinery: on-site operational start + job length; endDate auto-computed = start + (jobDays - 1)
  startDate: text("start_date").notNull().default(""), // ISO
  jobDays: integer("job_days").notNull().default(0),
  endDate: text("end_date").notNull().default(""), // ISO, last working day (return-to-yard day excluded)
  estTransferDays: integer("est_transfer_days").notNull().default(0), // client estimate of lowbed transfer-to-site days
  tenderStage: text("tender_stage").notNull().default("Bidding"),
  status: text("status").notNull().default("Open"), // Open | Awarded | Executing | Completed | Cancelled
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
});

/** bids — supplier offers on a tender (partial or full quantity) */
export const bids = sqliteTable("bids", {
  id: text("id").primaryKey(),
  tenderId: text("tender_id").notNull(),
  supplierId: text("supplier_id").notNull(),
  unitsOffered: integer("units_offered").notNull().default(1),
  pricePerUnitTzs: integer("price_per_unit_tzs").notNull().default(0), // cargo: flat per-unit; machinery: DERIVED = transferFee + dailyRate*jobDays
  // Machinery split-bid: one-off lowbed transfer + per-day rental (per unit)
  transferFeeTzs: integer("transfer_fee_tzs").notNull().default(0),
  dailyRateTzs: integer("daily_rate_tzs").notNull().default(0),
  availabilityNote: text("availability_note").notNull().default(""), // supplier free-text lead time / availability
  note: text("note").default(""),
  status: text("status").notNull().default("Open"), // Open | Awarded | Declined
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
});

/** contracts — Contracts & Escrow (one per awarded supplier, optionally under a tender) */
export const contracts = sqliteTable("contracts", {
  id: text("id").primaryKey(),
  tenderId: text("tender_id").default(""), // parent Job/Tender (empty for legacy single-asset)
  clientId: text("client_id").notNull(),
  supplierId: text("supplier_id").notNull(),
  assetId: text("asset_id").notNull().default(""),
  title: text("title").notNull().default(""),
  unitsAwarded: integer("units_awarded").notNull().default(1),
  agreedPricePerUnitTzs: integer("agreed_price_per_unit_tzs").notNull().default(0),
  routeClassification: text("route_classification").notNull().default("Domestic"), // Domestic | CrossBorder
  origin: text("origin").notNull().default(""),
  destination: text("destination").notNull().default(""),
  // --- Money ---
  contractValueTzs: integer("contract_value_tzs").notNull().default(0), // base value = units * per-unit (fee-exclusive)
  clientFeeTzs: integer("client_fee_tzs").notNull().default(0), // 5% client-side fee added on top
  totalEscrowBalanceTzs: integer("total_escrow_balance_tzs").notNull().default(0), // = amountToFund = contractValue + clientFee
  emergencyCreditDeductedTzs: integer("emergency_credit_deducted_tzs").notNull().default(0),
  platformFeeTzs: integer("platform_fee_tzs").notNull().default(0), // TOTAL 10% (clientFee + supplierFee) for revenue reporting
  supplierPayoutTzs: integer("supplier_payout_tzs").notNull().default(0),
  agreementSignedUrl: text("agreement_signed_url").default(""), // supplier-uploaded signed PDF
  // --- Timing (machinery hire) ---
  startDate: text("start_date").notNull().default(""), // ISO operational start
  endDate: text("end_date").notNull().default(""), // ISO last working day (extends on extension)
  dailyRateTzs: integer("daily_rate_tzs").notNull().default(0), // per-unit daily rate (for extension math)
  transferFeeTzs: integer("transfer_fee_tzs").notNull().default(0), // one-off transfer fee captured
  // --- Extension lifecycle ---
  reminderSentAt: text("reminder_sent_at").notNull().default(""), // guards 10-day reminder firing once
  extensionStatus: text("extension_status").notNull().default("None"), // None | Requested | AwaitingPayment | Extended | PaymentOverdue
  removalRight: integer("removal_right").notNull().default(0), // 1 = supplier may recover machine (unpaid extension past end date)
  // --- Payout chain (replaces silent auto-settle) ---
  payoutSlipKey: text("payout_slip_key").notNull().default(""), // KAM-uploaded TT slip to supplier (S3 key)
  // 4-step activation chain: None → TaskComplete (supplier) → AwaitingKamSubmission (client sign-off)
  //   → PendingAdminApproval (KAM submits) → AwaitingSupplierApproval (admin releases) → Approved (supplier confirms)
  payoutStatus: text("payout_status").notNull().default("None"),
  taskCompletedAt: integer("task_completed_at", { mode: "timestamp_ms" }), // supplier "Mark task complete"
  completionRemarks: text("completion_remarks").notNull().default(""), // supplier notes at task completion
  kamSubmittedAt: integer("kam_submitted_at", { mode: "timestamp_ms" }), // KAM "Submit payment request"
  adminApprovedAt: integer("admin_approved_at", { mode: "timestamp_ms" }), // admin "Approve & release"
  signedOffAt: integer("signed_off_at", { mode: "timestamp_ms" }), // client sign-off timestamp (triggers payout chain)
  // per-supplier sub-stage within the gate:
  // Awarded | AgreementSigned | MachineDocsUploaded | FieldVerified | Executing | SignedOff | FundsDisbursed
  contractStage: text("contract_stage").notNull().default("Awarded"),
  // legacy field kept for existing rows / settlement flow
  milestoneStatus: text("milestone_status").notNull().default("AwaitingEscrowDeposit"),
  // --- Reversal lifecycle (cancel / refund / shorten) ---
  cancelStatus: text("cancel_status").notNull().default("None"), // None | Requested | Reversed
  actualDaysWorked: integer("actual_days_worked"), // set on a shortened contract
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
});

/** reversals — cancellations, refunds & shortened (cut-off) contract reversals */
export const reversals = sqliteTable("reversals", {
  id: text("id").primaryKey(),
  contractId: text("contract_id").notNull(),
  tenderId: text("tender_id").notNull().default(""),
  requestedByProfileId: text("requested_by_profile_id").notNull(),
  reason: text("reason").notNull().default("Cancel"), // Cancel | Refund | Shorten
  stageAtRequest: text("stage_at_request").notNull().default(""), // contract/tender stage when requested
  actualDays: integer("actual_days"), // Shorten only — days actually worked
  clientNote: text("client_note").notNull().default(""),
  // workflow: Requested → KamReviewed → AdminApproved → Executed | Rejected
  status: text("status").notNull().default("Requested"),
  kamReviewedBy: text("kam_reviewed_by").notNull().default(""),
  kamNote: text("kam_note").notNull().default(""),
  adminApprovedBy: text("admin_approved_by").notNull().default(""),
  rejectReason: text("reject_reason").notNull().default(""),
  // --- Money snapshot (computed server-side at approval, simulated/tracked) ---
  clientRefundTzs: integer("client_refund_tzs").notNull().default(0),
  nguzoFeeKeptTzs: integer("nguzo_fee_kept_tzs").notNull().default(0),
  nguzoFeeRefundedTzs: integer("nguzo_fee_refunded_tzs").notNull().default(0),
  supplierPenaltyTzs: integer("supplier_penalty_tzs").notNull().default(0),
  transferFeeKeptTzs: integer("transfer_fee_kept_tzs").notNull().default(0),
  partsDeductedTzs: integer("parts_deducted_tzs").notNull().default(0),
  retainedInEscrowTzs: integer("retained_in_escrow_tzs").notNull().default(0),
  newContractValueTzs: integer("new_contract_value_tzs").notNull().default(0),
  lineItems: text("line_items", { mode: "json" })
    .$type<{ client: { label: string; amountTzs: number }[]; supplier: { label: string; amountTzs: number }[]; nguzo: { label: string; amountTzs: number }[] }>()
    .default({ client: [], supplier: [], nguzo: [] }),
  refundDestination: text("refund_destination").notNull().default("bank"), // bank (orchestrator instruction)
  reversalSlipKey: text("reversal_slip_key").notNull().default(""), // admin-uploaded reversal proof (S3 key)
  resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
});

/** extensions — contract hire extension requests (machinery) */
export const extensions = sqliteTable("extensions", {
  id: text("id").primaryKey(),
  contractId: text("contract_id").notNull(),
  addedDays: integer("added_days").notNull().default(0),
  newEndDate: text("new_end_date").notNull().default(""), // ISO
  extraAmountTzs: integer("extra_amount_tzs").notNull().default(0), // dailyRate * addedDays * units (fee-exclusive)
  clientFeeTzs: integer("client_fee_tzs").notNull().default(0), // 5% on extra
  amountToFundTzs: integer("amount_to_fund_tzs").notNull().default(0), // extra + clientFee
  // status machine:
  //   PendingSupplierAcceptance → Declined
  //     | → AwaitingSignatures → AwaitingKamActivation → PendingPayment → Paid | Lapsed
  status: text("status").notNull().default("PendingSupplierAcceptance"),
  supplierResponse: text("supplier_response").notNull().default("Pending"), // Pending | Accepted | Declined
  declineReason: text("decline_reason").notNull().default(""),
  clientSignedName: text("client_signed_name").notNull().default(""),
  clientSignedAt: integer("client_signed_at", { mode: "timestamp_ms" }),
  supplierSignedName: text("supplier_signed_name").notNull().default(""),
  supplierSignedAt: integer("supplier_signed_at", { mode: "timestamp_ms" }),
  contractDocId: text("contract_doc_id").notNull().default(""), // persisted ExtensionContract documents.id
  paymentProofUrl: text("payment_proof_url").notNull().default(""), // legacy; back-office proofs now persisted as documents
  dueDate: text("due_date").notNull().default(""), // ISO = contract's current end date (must clear before this)
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
});

/** parts — Emergency Spare Parts Catalog */
export const parts = sqliteTable("parts", {
  id: text("id").primaryKey(),
  partsSupplierId: text("parts_supplier_id").notNull().default(""), // profile.id of owning Parts Supplier
  partName: text("part_name").notNull(),
  sku: text("sku").notNull().default(""),
  compatibleModel: text("compatible_model").notNull().default(""),
  wholesaleCostTzs: integer("wholesale_cost_tzs").notNull().default(0),
  retailCostTzs: integer("retail_cost_tzs").notNull().default(0),
  darSupplierName: text("dar_supplier_name").notNull().default(""),
  darSupplierLocation: text("dar_supplier_location").notNull().default(""), // Nyerere Rd | Vingunguti
  logisticsHandlingFeeTzs: integer("logistics_handling_fee_tzs").notNull().default(0),
  stockQty: integer("stock_qty").notNull().default(0), // on-hand units (POS decrements on dispatch)
  status: text("status").notNull().default("Active"), // Active | OutOfStock
});

/** partOrders — breakdown fulfillment manifests */
export const partOrders = sqliteTable("part_orders", {
  id: text("id").primaryKey(),
  contractId: text("contract_id").notNull(),
  partId: text("part_id").notNull(),
  // routed POS chain: Requested → EscrowChecked → SentToParts → Dispatched → Delivered (or Rejected)
  status: text("status").notNull().default("Requested"),
  requestedByProfileId: text("requested_by_profile_id").notNull().default(""), // fleet/machinery supplier who reported breakdown
  kamId: text("kam_id").notNull().default(""), // KAM who checked escrow + routed it
  partsSupplierId: text("parts_supplier_id").notNull().default(""), // Parts Supplier fulfilling it
  deliverTo: text("deliver_to").notNull().default("MachineSupplier"), // MachineSupplier | FieldAgent
  retailCostTzs: integer("retail_cost_tzs").notNull().default(0), // retail snapshot at approval
  waybillRef: text("waybill_ref").notNull().default(""),
  rejectReason: text("reject_reason").notNull().default(""),
  courier: text("courier").default(""), // Shabiby | Super Feo
  totalCostTzs: integer("total_cost_tzs").notNull().default(0),
  manifestRef: text("manifest_ref").default(""),
  qty: integer("qty").notNull().default(1),
  receiverName: text("receiver_name").notNull().default(""),
  receiverDestination: text("receiver_destination").notNull().default(""),
  efdNumber: text("efd_number").notNull().default(""), // simulated EFD receipt number
  invoiceKey: text("invoice_key").notNull().default(""), // auto-generated invoice PDF on request
  receiptKey: text("receipt_key").notNull().default(""), // EFD receipt PDF after payment cleared
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
});

/** complianceItems — Transit Compliance Checklist */
export const complianceItems = sqliteTable("compliance_items", {
  id: text("id").primaryKey(),
  contractId: text("contract_id").notNull(),
  // TANSAD | TBS Clearance | TARURA Heavy Load | Phytosanitary | Municipal Clearance | Border Entry
  permitType: text("permit_type").notNull(),
  documentUrl: text("document_url").default(""),
  verificationStatus: text("verification_status").notNull().default("Pending"), // Pending | Verified | DiscrepancyFlagged
  errorLogs: text("error_logs").default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
});

/** inspections — Field Agent yard audits (now linkable to a tender/contract) */
export const inspections = sqliteTable("inspections", {
  id: text("id").primaryKey(),
  assetId: text("asset_id").default(""),
  tenderId: text("tender_id").default(""),
  contractId: text("contract_id").default(""),
  inspectorId: text("inspector_id").notNull(),
  assignedFieldId: text("assigned_field_id").notNull().default(""), // field agent assigned to this inspection (yard)
  supplierId: text("supplier_id").notNull().default(""), // supplier profile being inspected (for scoping/contact)
  vinPhotos: text("vin_photos", { mode: "json" }).$type<string[]>().default([]),
  frontPhotoKey: text("front_photo_key").notNull().default(""), // mandatory machine front photo (→ asset.photos)
  backPhotoKey: text("back_photo_key").notNull().default(""), // mandatory machine back photo (→ asset.photos)
  mechanicalNotes: text("mechanical_notes").default(""),
  legitimacySignedOff: integer("legitimacy_signed_off", { mode: "boolean" }).notNull().default(false),
  // --- 2-step field report + KAM review ---
  docsChecked: integer("docs_checked", { mode: "boolean" }).notNull().default(false), // step 1: fleet docs validated
  machineInspected: integer("machine_inspected", { mode: "boolean" }).notNull().default(false), // step 2: machine inspected
  reportStatus: text("report_status").notNull().default("Draft"), // Draft | Submitted | Approved | Declined
  reviewedBy: text("reviewed_by").notNull().default(""), // KAM profile.id
  declineReason: text("decline_reason").notNull().default(""), // shown to supplier on bounce-back
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
});

/** borderLogs — lite Border Liaison logging */
export const borderLogs = sqliteTable("border_logs", {
  id: text("id").primaryKey(),
  osbp: text("osbp").notNull(), // Tunduma | Namanga
  contractId: text("contract_id").default(""),
  institutionalWaitMinutes: integer("institutional_wait_minutes").notNull().default(0),
  clearanceOverrideNote: text("clearance_override_note").default(""),
  loggedBy: text("logged_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
});

/** cargoLoads — tender/cargo matching */
export const cargoLoads = sqliteTable("cargo_loads", {
  id: text("id").primaryKey(),
  cargoOwnerId: text("cargo_owner_id").notNull(),
  cargoType: text("cargo_type").notNull().default("General"), // Sand | Aggregate | General
  origin: text("origin").notNull().default(""),
  destination: text("destination").notNull().default(""),
  tonnage: real("tonnage").notNull().default(0),
  budgetTzs: integer("budget_tzs").notNull().default(0),
  status: text("status").notNull().default("Open"), // Open | Matched | Closed
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
});

/** loadBids — supplier interest on cargo loads */
export const loadBids = sqliteTable("load_bids", {
  id: text("id").primaryKey(),
  loadId: text("load_id").notNull(),
  supplierId: text("supplier_id").notNull(),
  assetId: text("asset_id").default(""),
  rateTzs: integer("rate_tzs").notNull().default(0),
  note: text("note").default(""),
  status: text("status").notNull().default("Interested"), // Interested | Accepted | Declined
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
});

/** invoices — settlement documents */
export const invoices = sqliteTable("invoices", {
  id: text("id").primaryKey(),
  contractId: text("contract_id").notNull(),
  party: text("party").notNull(), // Client | Supplier
  lineItems: text("line_items", { mode: "json" }).$type<{ label: string; amountTzs: number }[]>().default([]),
  totalTzs: integer("total_tzs").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
});

/** contactMessages — public marketing-site contact form submissions */
export const contactMessages = sqliteTable("contact_messages", {
  id: text("id").primaryKey(),
  name: text("name").notNull().default(""),
  company: text("company").default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").default(""),
  role: text("role").default(""),
  message: text("message").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
});

/**
 * documents — uploaded files scoped to a tender/contract.
 * kind: SignedAgreement | MachineDoc | Permit | TTProof (legacy) | VINPhoto | Other
 *     | Invoice | PaymentProofClient | PayoutProofSupplier | ExtensionContract
 *     | OperatorId | OperatorLicence
 */
export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(), // profile.id of uploader
  tenderId: text("tender_id").default(""),
  contractId: text("contract_id").default(""),
  kind: text("kind").notNull().default("Other"),
  label: text("label").notNull().default(""),
  fileKey: text("file_key").notNull().default(""), // S3 object key
  mimeType: text("mime_type").default(""),
  verifiedBy: text("verified_by").default(""), // profile.id of admin/field who verified
  verifiedAt: integer("verified_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
});

/** messages — per-tender thread between client / supplier / field / admin */
export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  tenderId: text("tender_id").notNull(),
  fromProfileId: text("from_profile_id").notNull(),
  body: text("body").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
});

/** activityEvents — readable timeline of every stage transition / action */
export const activityEvents = sqliteTable("activity_events", {
  id: text("id").primaryKey(),
  tenderId: text("tender_id").default(""),
  contractId: text("contract_id").default(""),
  actorProfileId: text("actor_profile_id").default(""),
  type: text("type").notNull().default("event"),
  summary: text("summary").notNull().default(""),
  meta: text("meta", { mode: "json" }).$type<Record<string, unknown>>().default({}),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
});

/** notifications — on-record notification log (real send deferred; status stays Logged) */
export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  recipientProfileId: text("recipient_profile_id").notNull(),
  tenderId: text("tender_id").default(""),
  channel: text("channel").notNull().default("email"), // email | sms
  subject: text("subject").notNull().default(""),
  body: text("body").notNull().default(""),
  status: text("status").notNull().default("Logged"), // Logged | Sent
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
});
