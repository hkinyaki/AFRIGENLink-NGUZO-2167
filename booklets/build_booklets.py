#!/usr/bin/env python3
"""Generate all AFRIGEN Link PDF booklets (HTML -> Chrome -> PDF)."""
import os
from components import *

OUT = "build"
os.makedirs(OUT, exist_ok=True)

FOOT = "afrigen.link · Confidential"

# Canonical 11-stage gate (from src/api/lib/stages.ts)
GATE = [
    (1, "Bidding", "Supplier"),
    (2, "Awarded", "Client"),
    (3, "Agreements", "Supplier"),
    (4, "Fleet docs", "Supplier"),
    (5, "Inspected", "Field"),
    (6, "Permits up", "Client"),
    (7, "Permits OK", "Admin"),
    (8, "Payment", "Client"),
    (9, "Escrow", "Admin"),
    (10, "Execute", "Admin"),
    (11, "Done", "—"),
]

# ============================================================ CLIENT BOOKLET
def client_booklet():
    p = []
    p.append(cover(
        "Client Handbook · Buyers & Shippers",
        "How to source transport &amp; machinery, securely.",
        "Everything you need to post a job, compare verified bids, fund a protected escrow, and track your contract from award to completion — on one accountable platform.",
        "Client onboarding guide", "Edition 2026.1",
        hero="assets/clients.webp",
        badge="Funds tracked, not held · You stay in control"))

    # TOC
    p.append(content_page("Client Handbook", FOOT, "02", f'''
      {sec_head("Contents", "What's inside")}
      {toc([
        ("01","Why AFRIGEN Link exists","The trust gap we close for buyers"),
        ("02","Getting started","Account, verification, your dashboard"),
        ("03","Post a job","Demand, quantity & description"),
        ("04","Compare &amp; award","Auto-fill the cheapest bids"),
        ("05","The staged gate","How your contract is protected"),
        ("06","Fund &amp; track","Escrow, permits, sign-off"),
        ("07","Costs &amp; support","Our 10% fee and how to reach us"),
      ])}
      {callout("THE PROMISE", "You never wire money to a stranger. Every supplier is verified, every shipment is inspected on the ground, and your capital sits in a protected escrow that only releases when <strong>you</strong> sign off the work.")}
    '''))

    # Why
    p.append(content_page("Client Handbook", FOOT, "03", f'''
      {sec_head("01 · Why AFRIGEN Link exists", "Africa has a trust problem, not a payment problem")}
      <p class="intro">Most freight and equipment marketplaces are passive — they list a supplier, take a cut, and disappear. When a truck breaks down at a border or a machine arrives in the wrong condition, you are on your own. AFRIGEN Link is built the opposite way: we sit <strong>inside</strong> every deal.</p>
      {cards(
        card("🛡️","Protected escrow","Your money is tracked in a dedicated facility and released only against signed-off milestones."),
        card("👷","Boots on the ground","Field inspectors physically verify every machine and yard before you commit."),
        card("🚏","Border liaison","Agents stationed at corridor crossings resolve portal failures and stalls manually."),
        card("🔧","Emergency parts cover","If a supplier breaks down mid-job, escrow can collateralize the spare part to keep you moving."))}
      {note("WHO THIS IS FOR", "Construction firms, mining operators, traders and project owners who need certified heavy equipment or reliable cargo transport across Tanzania and the EAC corridors — with zero performance risk.")}
    '''))

    # Getting started
    p.append(content_page("Client Handbook", FOOT, "04", f'''
      {sec_head("02 · Getting started", "Your account &amp; dashboard")}
      {step(1,"Create your account","Sign up as a <strong>Client</strong> with your email and a password. You'll land in your client dashboard.","First login")}
      {step(2,"Complete verification (KYB/KYC)","Submit your business details so we can issue your verified badge. Verified buyers get faster supplier responses.","One-time")}
      {step(3,"Know your dashboard","<strong>My Jobs</strong> lists every tender you've posted and its current stage. <strong>Post a Job</strong> opens the demand form. Each job opens a detail view with bids, a stage tracker, documents and a live activity timeline.","Daily use")}
      {band("assets/cargo.webp","Your command center","One desk, every job, full visibility")}
    '''))

    # Post a job
    p.append(content_page("Client Handbook", FOOT, "05", f'''
      {sec_head("03 · Post a job", "Tell us exactly what you need")}
      <p class="intro">A job (we call it a <strong>tender</strong>) describes a quantity demand — not a single asset. You can ask for several trucks or machines at once, and multiple suppliers can fill it together.</p>
      {step(1,"Choose the demand type","<strong>Cargo transport</strong> (trucks to move materials or goods) or <strong>Machinery rental</strong> (heavy equipment for a site).")}
      {step(2,"Pick the specific type","Select from the catalogue — e.g. Tipper Truck, Low-Bed Trailer, Excavator, Motor Grader, Mobile Crane.")}
      {step(3,"Describe the work","Type the cargo to move or the project in plain language, and set the <strong>route</strong>: Domestic (within Tanzania) or Cross-border (EAC corridor).")}
      {step(4,"Set the quantity","How many units you need. Suppliers can bid for part or all of it.")}
      {note("WHY QUANTITY MATTERS", "Instead of chasing five suppliers yourself, you post once. Several can each cover a share, and the system fills your full demand automatically — at a single fair price.")}
    '''))

    # Compare & award
    p.append(content_page("Client Handbook", FOOT, "06", f'''
      {sec_head("04 · Compare &amp; award", "The auto-fill engine")}
      <p class="intro">As suppliers bid, each one names a per-unit price and how many units they can supply. When you're ready to award, the system does the heavy lifting.</p>
      {cards(
        card("①","Cheapest first","Bids are ranked by price. The system accepts the cheapest until your quantity is filled."),
        card("②","One fair price","All awarded suppliers settle at a single <strong>flat fair price</strong> — the volume-weighted average — so nobody is treated unfairly."),
        card("③","You confirm","Nothing is binding until you click <strong>Confirm award</strong>. The system shows the lineup and total before you commit."),
        card("④","A contract each","Every awarded supplier gets their own contract of agreement for their share of the work."))}
      {callout("EXAMPLE", "You need <strong>3 tipper trucks</strong>. Supplier A bids 2 units at TZS 480k, Supplier B bids 2 at TZS 510k. The system awards A's 2 + 1 of B's, then settles both at the blended fair rate. You approve once.")}
    '''))

    # The gate
    p.append(content_page("Client Handbook", FOOT, "07", f'''
      {sec_head("05 · The staged gate", "Eleven locked steps — each blocks the next")}
      <p class="intro">Your contract can never skip ahead. Each stage must be completed by the responsible party before the next unlocks. This is what keeps every deal honest.</p>
      {gate(GATE)}
      <h3 class="sub-sec">What you do, and what happens around you</h3>
      {table(["Stage","Who acts","What it means for you"],[
        ["Bidding → Award","You","Confirm the winning lineup"],
        ["Agreements & fleet docs","Supplier","Suppliers sign and upload vehicle/machine papers"],
        ["Field inspection","Our field agent","We physically verify the asset on the ground"],
        ["Permits","You","Upload TARURA / TANSAD / border permits as required"],
        ["Permit check","Admin","We verify your permits are in order"],
        ["Payment (escrow)","You","Upload your TT payment proof — funding step"],
        ["Escrow confirmed → Execute","Admin","We confirm funds and release the supplier to work"],
      ])}
    '''))

    # Fund & track
    p.append(content_page("Client Handbook", FOOT, "08", f'''
      {sec_head("06 · Fund &amp; track", "Escrow, permits and sign-off")}
      <h3 class="sub-sec">Permits</h3>
      <p>Depending on your route, the system seeds the right checklist. <strong>Domestic</strong>: TARURA Heavy Load Permit + Municipal Clearance. <strong>Cross-border</strong>: TRA TANSAD, TBS Clearance, Phytosanitary Certificate, plus origin and destination OSBP entries. Upload them in your dashboard; our admin verifies before money moves.</p>
      <h3 class="sub-sec">Funding the escrow</h3>
      <p>You pay into AFRIGEN Link's facility and upload your <strong>TT payment proof</strong>. The platform previews this as a protected escrow — <strong>funds tracked, not held loosely</strong>. Nothing is disbursed to suppliers until you've approved the completed work.</p>
      {kpis([("7<small>%</small>","Flat service fee"),("11","Locked gate steps"),("100<small>%</small>","Escrow-backed")])}
      <h3 class="sub-sec">Tracking &amp; settlement</h3>
      <p>Your job's <strong>activity timeline</strong> logs every action with a timestamp. On sign-off, the system auto-generates an itemized invoice and runs settlement: supplier payout = escrow − our 10% fee − any emergency parts credit used.</p>
    '''))

    # Costs & support
    p.append(content_page("Client Handbook", FOOT, "09", f'''
      {sec_head("07 · Costs &amp; support", "Simple, flat, transparent")}
      <p class="intro">There are no hidden margins buried in supplier quotes. We charge one flat fee, shown clearly on every invoice.</p>
      {cards(
        card("10%","Our service fee","A flat 10% of the contract value — that's it. It funds the escrow, inspections and border support that protect you."),
        card("📄","Itemized invoices","Every contract produces a clear breakdown: escrow funded, fee, any parts credit, net to supplier."),
        card("💬","Reach a human","Notifications are logged to your registered email and phone on every key step."),
        card("🔒","Your data","KYB/KYC details are used only to verify and protect deals on the platform."))}
      {callout("NEED HELP?", "Use the <strong>Contact</strong> page on afrigen.link or reply to any notification. A real coordinator — not a bot — handles escalations.")}
    '''))
    return doc("AFRIGEN Link — Client Handbook", *p)


# ============================================================ SUPPLIER BOOKLET
def supplier_booklet():
    p = []
    p.append(cover(
        "Supplier Handbook · Fleet &amp; Machinery Owners",
        "Win work. Get paid. Without the risk.",
        "How to list your assets, bid on open tenders, win awards, pass inspection, and receive guaranteed payment from an escrow that's funded before you move.",
        "Supplier onboarding guide", "Edition 2026.1",
        hero="assets/owners.webp",
        badge="Payment secured before you roll"))

    p.append(content_page("Supplier Handbook", FOOT, "02", f'''
      {sec_head("Contents", "What's inside")}
      {toc([
        ("01","Why bid with AFRIGEN Link","Protection from delayed &amp; predatory terms"),
        ("02","Set up &amp; verify","Account, KYB, your asset vault"),
        ("03","List your fleet","Add trucks &amp; machinery"),
        ("04","Bid on tenders","Partial or full quantity"),
        ("05","Win an award","Agreements &amp; fleet documents"),
        ("06","Inspection &amp; execution","The field check and going live"),
        ("07","Get paid","Settlement, the 10% fee, emergency parts"),
      ])}
      {callout("THE PROMISE", "You don't chase clients for money. The full contract value is funded into escrow <strong>before</strong> you're released to work — and your payout is calculated automatically the moment the client signs off.")}
    '''))

    p.append(content_page("Supplier Handbook", FOOT, "03", f'''
      {sec_head("01 · Why bid with AFRIGEN Link", "An end to delayed &amp; predatory terms")}
      <p class="intro">If you own trucks or machinery, you know the pain: brokers who pay 90 days late, clients who vanish, jobs that turn out to be nothing like described. AFRIGEN Link removes that risk by funding the deal up front and protecting both sides.</p>
      {cards(
        card("💰","Funded before you move","Escrow is filled and confirmed before execution — your payment is secured."),
        card("⚖️","Fair, single price","When several suppliers fill one job, everyone settles at the same fair rate."),
        card("📑","Clear contracts","Each award gives you a signed agreement for your exact share."),
        card("🔧","Breakdown support","Mid-job emergency parts can be collateralized against escrow so you keep working."))}
      {note("REGISTRATION", "List as a verified supplier once. A clean KYB profile builds your reputation and gets your bids taken seriously.")}
    '''))

    p.append(content_page("Supplier Handbook", FOOT, "04", f'''
      {sec_head("02 · Set up &amp; verify", "Account, KYB and your vault")}
      {step(1,"Sign up as a Supplier","Register with your email and password. Public signup only offers Client and Supplier roles.","First login")}
      {step(2,"Complete KYB","Provide your business and fleet details to earn your verified badge. Verified suppliers stand out to clients.","One-time")}
      {step(3,"Tour your dashboard","<strong>Open Tenders</strong> shows jobs you can bid on. <strong>My Awards</strong> tracks what you've won. <strong>Fleet</strong> is your asset list, the <strong>Escrow Vault</strong> shows secured funds, and <strong>Report Breakdown</strong> raises an emergency.","Daily use")}
      {band("assets/inspection.webp","Verified once, trusted always","Inspection is your edge, not your enemy")}
    '''))

    p.append(content_page("Supplier Handbook", FOOT, "05", f'''
      {sec_head("03 · List your fleet", "Add trucks &amp; machinery")}
      <p class="intro">Your <strong>Fleet</strong> is the catalogue of assets you can offer. Keep it current — accurate listings win more bids and clear inspection faster.</p>
      {step(1,"Open Fleet → Add Asset","Click <strong>Add Asset</strong> to open the asset form.")}
      {step(2,"Classify the asset","Mark it as a cargo carrier (e.g. Flatbed, Low-Bed Trailer, Tipper) or machinery (e.g. Excavator, Wheel Loader, Grader).")}
      {step(3,"Add the details","Registration, capacity/specification and condition. Honest specs save you at inspection.")}
      {note("PRO TIP", "The closer your listed condition matches reality, the faster our field agent signs off — and the sooner the client funds escrow.")}
    '''))

    p.append(content_page("Supplier Handbook", FOOT, "06", f'''
      {sec_head("04 · Bid on tenders", "Partial or full quantity")}
      <p class="intro">Open Tenders shows live client demand. You don't have to cover the whole job — bid for as many units as you can deliver.</p>
      {cards(
        card("①","Read the demand","Check the asset type, route (domestic / cross-border), quantity and description."),
        card("②","Set your offer","Name your <strong>per-unit price</strong> and how many units you can supply."),
        card("③","Submit","Your bid joins the lineup. The system ranks all bids by price."),
        card("④","Auto-award","Cheapest bids fill the demand first; you may be awarded part of your offer to exactly meet the client's quantity."))}
      {callout("HOW AWARDS ARE DECIDED", "Cheapest first, until the client's quantity is met. If your price is competitive you win — and all winners are paid the same blended <strong>flat fair price</strong>.")}
    '''))

    p.append(content_page("Supplier Handbook", FOOT, "07", f'''
      {sec_head("05 · Win an award", "Agreements &amp; fleet documents")}
      <p class="intro">When the client confirms the award, your part of the gate begins. Two supplier steps come first — and they block everything after them.</p>
      {step(1,"Sign the agreement","Download your auto-generated contract of agreement (PDF), sign it, and re-upload the signed copy. <em>(E-signature is coming; for now it's download → sign → upload.)</em>","Stage: Awarded")}
      {step(2,"Upload fleet documents","Upload the vehicle/machine papers for the assets you'll deploy. These go to our field agent and admin.","Stage: Agreements signed")}
      {note("ORDER IS LOCKED", "You can't upload fleet docs before the agreement is signed, and the field inspection can't start before your docs are in. The gate enforces this automatically.")}
    '''))

    p.append(content_page("Supplier Handbook", FOOT, "08", f'''
      {sec_head("06 · Inspection &amp; execution", "The field check and going live")}
      {step(1,"Field inspection","Our field agent physically verifies your asset and yard, checks the documents against the machine, and signs it off in the system.","Stage: Field verified")}
      {step(2,"Client permits &amp; payment","The client uploads route permits, admin verifies them, then the client funds the escrow with a TT payment proof.","Client + Admin")}
      {step(3,"Escrow confirmed → Execute","Once admin confirms the escrow and gives the final approval, you're released to perform the work.","Stage: Executing")}
      {band("assets/border.webp","Crossing a corridor?","Our liaison agents clear the bureaucracy for you")}
    '''))

    p.append(content_page("Supplier Handbook", FOOT, "09", f'''
      {sec_head("07 · Get paid", "Settlement, fee &amp; emergency parts")}
      <h3 class="sub-sec">Automated settlement</h3>
      <p>When the client signs off, the system runs settlement instantly. Your payout is calculated as:</p>
      {callout("YOUR PAYOUT", "<strong>Gross escrow</strong> on your contract <strong>−</strong> AFRIGEN Link's 10% service fee <strong>−</strong> any emergency parts credit you used <strong>=</strong> Final supplier payout.")}
      <h3 class="sub-sec">Emergency parts facility</h3>
      <p>Break down mid-job? Raise it under <strong>Report Breakdown</strong>. If the locked escrow covers the part plus shipping, the system approves the purchase from our Dar wholesale network and dispatches it upcountry by express courier — typically 12–18 hours. The cost is simply deducted at settlement.</p>
      {kpis([("7<small>%</small>","Flat fee"),("12–18<small>h</small>","Parts delivery"),("0","Chasing clients")])}
    '''))
    return doc("AFRIGEN Link — Supplier Handbook", *p)


# ============================================================ FIELD AGENT MANUAL
def field_booklet():
    p = []
    p.append(cover(
        "Field Manual · Ground Force",
        "You are the moat.",
        "The operating manual for AFRIGEN Link field inspectors and border liaison agents — the physical layer of trust that no software competitor can copy.",
        "Field agent field manual", "Edition 2026.1",
        hero="assets/inspection.webp",
        badge="Internal · Ground Force only"))

    p.append(content_page("Field Manual", FOOT, "02", f'''
      {sec_head("Contents", "What's inside")}
      {toc([
        ("01","Your role","Why boots on the ground win"),
        ("02","Your dashboard","Inspections, audits &amp; logs"),
        ("03","Yard audit","Mechanical &amp; legal verification"),
        ("04","Document check","Matching papers to the machine"),
        ("05","Sign off &amp; advance","Releasing the gate"),
        ("06","Border liaison","OSBP crossings &amp; portal stalls"),
        ("07","Standards &amp; integrity","Non-negotiables"),
      ])}
      {callout("WHY YOU MATTER", "Every passive marketplace failed because nobody verified the real world. You do. A signed-off inspection is the difference between a confident client and a wired-away fortune.")}
    '''))

    p.append(content_page("Field Manual", FOOT, "03", f'''
      {sec_head("01 · Your role", "Boots on the ground")}
      <p class="intro">You sit between the supplier's promise and the client's money. Your verification unlocks the funding step — so your judgement protects real capital. Two roles operate in the Ground Force:</p>
      {cards(
        card("👷","Field Inspector","On-site mechanical and legal yard audits. You confirm the asset is real, sound, and matches its documents before escrow is funded."),
        card("🚏","Border Liaison","Stationed at corridor OSBPs (Tunduma, Namanga, Rusumo). You manually resolve portal failures and bureaucratic stalls that software can't."))}
      {note("THE PRINCIPLE", "AFRIGEN Link never lets a deal advance on trust alone. Your physical sign-off is a hard gate — the contract cannot move to funding without it.")}
    '''))

    p.append(content_page("Field Manual", FOOT, "04", f'''
      {sec_head("02 · Your dashboard", "Inspections, audits &amp; logs")}
      {step(1,"Inspections queue","Your home view lists tenders awaiting inspection — assets at the <strong>Machine docs uploaded</strong> stage, ready for your visit.")}
      {step(2,"Open an inspection","Tap a job to see the supplier's uploaded documents, the asset details and the client's requirement.")}
      {step(3,"Yard Audits","A running log of every audit you complete — your record of work and a reference for repeat suppliers.")}
      {step(4,"Border Log","Where liaison agents record OSBP crossings, wait times and clearance notes.")}
      {band("assets/inspection.webp","On the yard","Trust is verified in person, not on a screen")}
    '''))

    p.append(content_page("Field Manual", FOOT, "05", f'''
      {sec_head("03 · Yard audit", "Mechanical &amp; legal verification")}
      <p class="intro">Run the same disciplined check every time. Consistency is what makes our verified badge mean something.</p>
      {chk([
        "<strong>Asset identity</strong> — VIN / chassis / registration matches the listing and the uploaded papers.",
        "<strong>Mechanical condition</strong> — engine, hydraulics, tyres/tracks, lights, brakes. Note any fault.",
        "<strong>Capacity &amp; spec</strong> — the machine genuinely meets the client's stated requirement.",
        "<strong>Legal standing</strong> — ownership, insurance and inspection papers are valid and current.",
        "<strong>Yard legitimacy</strong> — the supplier operates a real, traceable yard, not a paper front.",
      ])}
      {note("RECORD EVERYTHING", "Enter the VIN, your findings and a clear pass/fail note. If anything is off, do not sign off — flag it. A blocked deal is cheaper than a failed one.")}
    '''))

    p.append(content_page("Field Manual", FOOT, "06", f'''
      {sec_head("04 · Document check", "Matching papers to the machine")}
      <p class="intro">The supplier uploaded fleet documents at the previous stage. Your job is to confirm the paper and the steel are the same thing.</p>
      {table(["Check","What you're confirming"],[
        ["Registration","Plate / chassis on the document = plate / chassis on the asset"],
        ["Ownership","The supplier on the platform is the lawful owner or authorized operator"],
        ["Insurance","Cover is active and appropriate for the work and route"],
        ["Fitness","Inspection / fitness certificate is valid and unexpired"],
        ["Capacity","Rated capacity supports the client's load or task"],
      ])}
      {callout("IF DOCUMENTS DON'T MATCH", "Stop. Record the discrepancy in your inspection notes and leave the gate closed. Escalate to admin. The supplier corrects and re-submits before you re-inspect.")}
    '''))

    p.append(content_page("Field Manual", FOOT, "07", f'''
      {sec_head("05 · Sign off &amp; advance", "Releasing the gate")}
      {step(1,"Confirm the inspection","Tick that the on-site inspection passed and enter the VIN and your notes.","Required")}
      {step(2,"Verify &amp; advance","Submitting your sign-off advances the contract from <strong>Machine docs uploaded</strong> to <strong>Field verified</strong> — and only then can the client move to permits and payment.","Stage: Field verified")}
      {step(3,"Your audit is logged","The completed audit appears in your Yard Audits history with a timestamp, forming the permanent record.")}
      {note("YOU ARE A HARD GATE", "Nothing financial happens before your sign-off. Take the time to get it right — there is no pressure to rush a pass.")}
    '''))

    p.append(content_page("Field Manual", FOOT, "08", f'''
      {sec_head("06 · Border liaison", "OSBP crossings &amp; portal stalls")}
      <p class="intro">Cross-border jobs run through One-Stop Border Posts on three corridors. When portals fail or paperwork stalls, you resolve it in person — that's the service software can't deliver.</p>
      {cards(
        card("🟡","Southern","Tunduma → into Zambia"),
        card("🟢","Central","Toward Rwanda &amp; Burundi"),
        card("🔵","Northern","Namanga → toward Kenya"),
        card("📝","Log it","Record OSBP, wait time and a clearance note for every crossing"))}
      <h3 class="sub-sec">Border Log entry</h3>
      <p>For each crossing, select the OSBP, enter the wait time in hours, and write a clearance note describing what was processed or what stalled. This builds the corridor intelligence that makes our routing reliable over time.</p>
    '''))

    p.append(content_page("Field Manual", FOOT, "09", f'''
      {sec_head("07 · Standards &amp; integrity", "Non-negotiables")}
      {chk([
        "<strong>Verify in person, always.</strong> Never sign off remotely or on a supplier's word.",
        "<strong>Document the truth.</strong> Your notes are a legal-grade record — accurate, specific, dated.",
        "<strong>No incentive to pass.</strong> You are paid to be right, not to be fast. A fail protects the platform.",
        "<strong>Independence.</strong> You work for AFRIGEN Link and the integrity of the deal — never for the supplier.",
        "<strong>Escalate doubt.</strong> If something feels wrong, leave the gate closed and tell admin.",
      ])}
      {callout("THE GROUND FORCE CREED", "We are the reason a buyer three countries away can wire money with confidence. The platform is the promise — <strong>we are the proof</strong>.")}
    '''))
    return doc("AFRIGEN Link — Field Manual", *p)


# ============================================================ ADMIN / OPS MANUAL
def admin_booklet():
    p = []
    p.append(cover(
        "Operations Manual · HQ Admin",
        "Running the platform.",
        "The control manual for AFRIGEN Link administrators — overseeing jobs, verifying permits, confirming escrow, approving execution, managing the Ground Force, and reconciling the ledger.",
        "Admin / operations manual", "Edition 2026.1",
        hero="assets/security.webp",
        badge="Internal · HQ administrators only"))

    p.append(content_page("Operations Manual", FOOT, "02", f'''
      {sec_head("Contents", "What's inside")}
      {toc([
        ("01","Your mandate","Custodian of the gate"),
        ("02","Overview","Reading the operations dashboard"),
        ("03","Jobs &amp; the gate","Driving contracts forward"),
        ("04","Verify permits","The compliance check"),
        ("05","Confirm payment","Escrow funding &amp; release"),
        ("06","Ground Force &amp; Team","People &amp; access"),
        ("07","Ledger &amp; settlement","Money, fees &amp; invoices"),
      ])}
      {callout("YOUR POSITION", "You are the only role that confirms money and releases execution. Three of the eleven gate steps are yours. Discipline here is the platform's reputation.")}
    '''))

    p.append(content_page("Operations Manual", FOOT, "03", f'''
      {sec_head("01 · Your mandate", "Custodian of the gate")}
      <p class="intro">Admins don't buy, sell or transport. You orchestrate — verifying that each party did their part before the next step unlocks, and that money only moves when the work is real.</p>
      {cards(
        card("✅","Verify permits","Confirm the client's route permits are valid before payment."),
        card("💳","Confirm escrow","Confirm the client's TT proof so funds are recognized as secured."),
        card("🚀","Approve execution","Give the final go that releases the supplier to work."),
        card("👥","Manage people","Control roles and access for the Ground Force and team."))}
      {note("ACCESS IS PRIVILEGED", "Admin and field roles are internal-only and never self-assignable. Only an existing admin (or the env allowlist super-admins) can grant them.")}
    '''))

    p.append(content_page("Operations Manual", FOOT, "04", f'''
      {sec_head("02 · Overview", "Reading the dashboard")}
      <p class="intro">The <strong>Overview</strong> is your situational picture — what's live, what's waiting on you, and where the money is.</p>
      {step(1,"Active jobs &amp; stages","See every tender and the stage it sits at, so you can spot what's blocked on an admin action.")}
      {step(2,"Pending actions","Permits awaiting verification, TT proofs awaiting confirmation, and contracts ready for execution approval.")}
      {step(3,"Ground Force status","Who is inspecting and where liaison agents are deployed.")}
      {step(4,"Ledger snapshot","Escrow held, fees earned and settlements run.")}
      {band("assets/corridor.webp","Three corridors, one desk","Southern · Central · Northern")}
    '''))

    p.append(content_page("Operations Manual", FOOT, "05", f'''
      {sec_head("03 · Jobs &amp; the gate", "Driving contracts forward")}
      <p class="intro">Open <strong>Jobs</strong> to act on any contract. The gate is strict — you can only advance the current step, and only when its condition is met.</p>
      {gate(GATE)}
      <h3 class="sub-sec">Your three steps</h3>
      {table(["From stage","Your action","To stage"],[
        ["Permits uploaded","Verify the client's permits","Permits verified"],
        ["Payment proof uploaded","Confirm the escrow funding","Escrow confirmed"],
        ["Escrow confirmed","Approve to execute","Executing"],
      ])}
      {note("NEVER SKIP", "If a step's condition isn't met, the advance is rejected by the system. Don't work around it — chase the responsible party instead.")}
    '''))

    p.append(content_page("Operations Manual", FOOT, "06", f'''
      {sec_head("04 · Verify permits", "The compliance check")}
      <p class="intro">Before any money is recognized, confirm the client has the legal right to run the route. The system seeds the correct checklist by route type.</p>
      {table(["Route","Required permits"],[
        ["Domestic","TARURA Heavy Load Permit · Municipal Clearance"],
        ["Cross-border","TRA TANSAD · TBS Clearance · Phytosanitary Certificate · Origin OSBP entry · Destination OSBP entry"],
      ])}
      {step(1,"Open the uploaded permits","Review each document the client submitted against the seeded checklist.")}
      {step(2,"Verify or reject","If complete and valid, mark permits verified to unlock the payment step. If not, leave it closed and notify the client to re-submit.","Stage: Permits verified")}
      {note("MANUAL BY DESIGN", "Auto-fetch from regulatory portals comes later. For now you inspect uploaded documents — Hugo's ground-zero safety discipline.")}
    '''))

    p.append(content_page("Operations Manual", FOOT, "07", f'''
      {sec_head("05 · Confirm payment", "Escrow funding &amp; release")}
      {step(1,"Review the TT proof","The client uploads a telegraphic-transfer proof for the contract value. Match the amount and reference.","Stage: Payment uploaded")}
      {step(2,"Confirm the escrow","Confirming marks the funds as secured in AFRIGEN Link's facility. The UI previews this as a protected escrow — <strong>funds tracked, not held loosely</strong>.","Stage: Escrow confirmed")}
      {step(3,"Approve to execute","With escrow confirmed, give the final approval. The supplier and field agent are notified and work begins.","Stage: Executing")}
      {callout("MONEY FRAMING", "Until a licensed escrow partner is integrated, funds are tracked in AFRIGEN Link's own account and presented as escrow. Keep the &ldquo;tracked, not held&rdquo; language consistent everywhere.")}
    '''))

    p.append(content_page("Operations Manual", FOOT, "08", f'''
      {sec_head("06 · Ground Force &amp; Team", "People &amp; access")}
      <h3 class="sub-sec">Ground Force</h3>
      <p>Assign and monitor field inspectors and border liaison agents. Review their yard audits and border logs — this is your visibility into the physical moat.</p>
      <h3 class="sub-sec">Team &amp; Access</h3>
      <p>The <strong>Team</strong> screen lists every user with a role dropdown. Hard rules enforced by the system:</p>
      {chk([
        "Public signup only offers <strong>Client</strong> and <strong>Supplier</strong>.",
        "Admin and field are <strong>internal-only</strong> — granted here, never self-assigned.",
        "You <strong>cannot demote yourself</strong>, and allowlisted super-admins are locked.",
        "Promoting a client/supplier to admin or field is logged.",
      ])}
      {note("SECURITY", "Super-admins are set by the secret ADMIN_EMAILS allowlist and auto-promoted on login. They can't be demoted from the UI.")}
    '''))

    p.append(content_page("Operations Manual", FOOT, "09", f'''
      {sec_head("07 · Ledger &amp; settlement", "Money, fees &amp; invoices")}
      <p class="intro">On client sign-off, the settlement engine runs automatically. Your job is to reconcile and disburse against its output.</p>
      {callout("SETTLEMENT FORMULA", "Supplier payout = <strong>Gross escrow</strong> − <strong>AFRIGEN Link 10% service fee</strong> − <strong>emergency parts credit used</strong>. Itemized invoices are auto-generated for both client and supplier.")}
      {table(["Ledger line","Client view","Supplier view"],[
        ["Escrow funded","Total in","Gross on contract"],
        ["Service fee (10%)","−","−"],
        ["Parts credit used","−","−"],
        ["Net to supplier","disbursed","final payout"],
      ])}
      {step(1,"Reconcile","Confirm the engine's figures against the funded escrow and any parts credit drawn.")}
      {step(2,"Disburse &amp; close","Release the net payout to the supplier and mark the contract completed. Notifications log to both parties.","Stage: Completed")}
    '''))
    return doc("AFRIGEN Link — Operations Manual", *p)


# ============================================================ COMPANY / PITCH BOOKLET
def company_booklet():
    p = []
    p.append(cover(
        "Company Overview · Investors &amp; Partners",
        "The pillar behind every deal.",
        "AFRIGEN Link is embedded operating infrastructure for heavy machinery and cargo coordination across East Africa — solving the trust problem that defeated every marketplace before us.",
        "Confidential overview", "Edition 2026.1",
        hero="assets/hero.webp",
        badge="Cargo &amp; Machinery Coordination — Secured"))

    p.append(content_page("Company Overview", FOOT, "02", f'''
      {sec_head("The problem", "Africa has a trust problem, not a payment problem")}
      <p class="intro">A decade of African logistics marketplaces — well-funded, well-built — stalled or failed. The reason is consistent: they were <strong>passive</strong>. They matched a buyer to a supplier, took a fee, and stepped away. In a market where a truck can vanish at a border and a machine can arrive broken, matching is not enough.</p>
      {cards(
        card("⚠️","Performance risk","Buyers wire large sums to suppliers they've never met, for assets they've never seen."),
        card("⏳","Predatory terms","Asset owners face 90-day payment delays and broker games."),
        card("🚧","Border friction","Portal failures and bureaucratic stalls strand cargo at OSBPs."),
        card("🔌","No recourse","When something breaks mid-job, nobody on the platform can help."))}
      {callout("OUR THESIS", "The winner won't be the best app. It will be the operator that puts <strong>boots on the ground</strong> and <strong>money in escrow</strong> — making trust a feature, not a hope.")}
    '''))

    p.append(content_page("Company Overview", FOOT, "03", f'''
      {sec_head("The solution", "Embedded operating infrastructure")}
      <p class="intro">AFRIGEN Link sits inside every transaction with three moats that no software-only competitor can replicate quickly. Money stays simulated — <strong>tracked, not held</strong> — until a licensed escrow partner is integrated.</p>
      {cards(
        card("🛡️","Collateralized escrow","Full contract value funded before execution; auto split-settlement with a flat 10% fee on sign-off."),
        card("👷","Ground Force","Field inspectors verify every asset on-site; border liaison agents resolve OSBP stalls in person."),
        card("🔧","Escrow-as-credit parts","Mid-job breakdowns are kept moving by collateralizing emergency spares against the locked escrow."),
        card("🧭","Three corridors","Southern (Tunduma/Zambia), Central (Rwanda/Burundi), Northern (Namanga/Kenya)."))}
      {band("assets/corridor.webp","The corridor network","Dar es Salaam HQ · three EAC corridors")}
    '''))

    p.append(content_page("Company Overview", FOOT, "04", f'''
      {sec_head("How it works", "One flywheel, eleven locked steps")}
      <p class="intro">A client posts a quantity demand. Suppliers bid. The system auto-fills the cheapest at a single fair price. Then a strict gate carries the deal to completion — every step blocking the next.</p>
      {gate(GATE)}
      {kpis([("7<small>%</small>","Flat service fee"),("3","EAC corridors"),("11","Locked gate steps"),("4","Stakeholder roles")])}
      <p style="margin-top:14px">Each step is owned by a specific party — client, supplier, field agent or admin — and enforced in software. There is no way to skip ahead, which is precisely what lets a buyer in another country fund a deal with confidence.</p>
    '''))

    p.append(content_page("Company Overview", FOOT, "05", f'''
      {sec_head("Who we serve", "A four-sided market")}
      {cards(
        card("🏗️","Clients &amp; shippers","Construction, mining and trading firms needing certified equipment or cargo transport with zero performance risk."),
        card("🚛","Fleet &amp; machinery owners","Asset owners seeking guaranteed payment and protection from predatory terms."),
        card("👷","Ground Force","Our own field inspectors and border liaison agents — the physical moat."),
        card("🏛️","Admin / HQ","The orchestration layer that verifies, confirms and settles every deal."))}
      {note("MARKET", "Tanzania core, expanding along EAC transit corridors. Demand is structural — infrastructure, mining and trade volumes are growing while trusted coordination remains scarce.")}
    '''))

    p.append(content_page("Company Overview", FOOT, "06", f'''
      {sec_head("Business model", "Flat, aligned, scalable")}
      <p class="intro">One transparent revenue line, charged on value delivered — not buried in supplier quotes.</p>
      {table(["Revenue","Mechanism"],[
        ["Service fee","Flat <strong>10%</strong> of contract value on every deal, both cargo and machinery"],
        ["Settlement","Auto-calculated: supplier payout = escrow − 10% fee − parts credit used"],
        ["Parts facility","Emergency spares collateralized against escrow — sticky, defensible, value-add"],
      ])}
      {cards(
        card("📈","Aligned incentives","We earn only when a deal completes and the client signs off — fully aligned with both sides."),
        card("🔒","Defensible","The moats — ground force, escrow, parts credit — compound with every corridor and every verified supplier."))}
      {callout("THE NAME", "<strong>AFRIGEN Link</strong> is Swahili for <em>pillar</em> — the foundation that holds everything up. That's the role we play in every deal: the pillar behind it.")}
    '''))

    p.append(content_page("Company Overview", FOOT, "07", f'''
      {sec_head("Status &amp; roadmap", "Built, and building")}
      <h3 class="sub-sec">Live today</h3>
      {bul([
        "Full platform: marketing site + four role dashboards (client, supplier, field, admin).",
        "Quantity-demand tender engine with auto-fill awarding at a flat fair price.",
        "Strict 11-step approval gate enforced end-to-end across all roles.",
        "Verified-badge KYB/KYC gate; internal-only admin &amp; field access controls.",
        "Auto-generated agreements &amp; itemized invoices; activity timelines on every job.",
        "Notifications logged on-record (email live via Resend; SMS/WhatsApp staged).",
      ])}
      <h3 class="sub-sec">Staged next</h3>
      {bul([
        "Licensed escrow partner (moving from tracked to held).",
        "Live SMS / WhatsApp gateway and real courier API integration.",
        "Automated permit assembly (TANSAD) and AI coordination copilot.",
        "Mobile app for field and supplier on phone browsers.",
      ])}
      {callout("CONTACT", "AFRIGEN Link · Dar es Salaam, Tanzania · afrigen.link — partnership and investment enquiries via the Contact page.")}
    '''))
    return doc("AFRIGEN Link — Company Overview", *p)


# ============================================================ COMBINED PLATFORM GUIDE
def combined_booklet():
    p = []
    p.append(cover(
        "Platform Guide · All Roles",
        "One platform. Four roles. Every step.",
        "The complete operating guide to AFRIGEN Link — for clients, suppliers, field agents and administrators. The single reference for how the whole system works together.",
        "Master platform guide", "Edition 2026.1",
        hero="assets/hero.webp",
        badge="Cargo &amp; Machinery Coordination — Secured"))

    p.append(content_page("Platform Guide", FOOT, "02", f'''
      {sec_head("Contents", "The whole system, end to end")}
      {toc([
        ("01","The big picture","What AFRIGEN Link is and why it works"),
        ("02","The four roles","Who does what"),
        ("03","The staged gate","Eleven steps, end to end"),
        ("04","Clients","Post, award, fund, track"),
        ("05","Suppliers","List, bid, win, get paid"),
        ("06","Field &amp; Admin","Verify, confirm, settle"),
        ("07","Money &amp; trust","Escrow, fee, parts, settlement"),
      ])}
      {callout("READ THIS FIRST", "AFRIGEN Link is not a marketplace — it's embedded coordination infrastructure. Every deal runs through a locked, role-by-role gate with money in protected escrow. This guide explains each piece and how they connect.")}
    '''))

    p.append(content_page("Platform Guide", FOOT, "03", f'''
      {sec_head("01 · The big picture", "Trust, made operational")}
      <p class="intro">A client needs trucks or machinery. Suppliers compete to provide them. Our Ground Force verifies the real-world assets. Admins confirm compliance and money. Escrow protects everyone. That's the entire system — and it's why a buyer can transact across borders with confidence.</p>
      {cards(
        card("🛡️","Escrow","Funds tracked &amp; protected; released only on sign-off."),
        card("👷","Ground Force","Physical inspection &amp; border support — the moat."),
        card("🔧","Parts credit","Breakdowns kept moving via escrow-collateralized spares."),
        card("⚖️","Fair pricing","Multi-supplier demand filled at one flat fair price."))}
      {band("assets/cargo.webp","Cargo &amp; machinery, coordinated","From Dar es Salaam across three corridors")}
    '''))

    p.append(content_page("Platform Guide", FOOT, "04", f'''
      {sec_head("02 · The four roles", "Who does what")}
      {table(["Role","Owns","Key screens"],[
        ["<strong>Client</strong>","Posts demand, awards, funds escrow, signs off","My Jobs · Post a Job · job detail"],
        ["<strong>Supplier</strong>","Lists assets, bids, signs agreement, performs work","Open Tenders · My Awards · Fleet · Vault · Breakdown"],
        ["<strong>Field</strong>","Inspects assets on-site, logs borders","Inspections · Yard Audits · Border Log"],
        ["<strong>Admin</strong>","Verifies permits, confirms escrow, approves, settles","Overview · Jobs · Ground Force · Verification · Team · Notifications · Ledger"],
      ])}
      {note("ACCESS", "Public signup offers Client and Supplier only. Field and Admin are internal-only, granted by an existing admin — never self-assigned.")}
    '''))

    p.append(content_page("Platform Guide", FOOT, "05", f'''
      {sec_head("03 · The staged gate", "Eleven steps, each blocks the next")}
      <p class="intro">This is the spine of the platform. A contract advances one step at a time, only when the responsible party completes their part. No skipping — ever.</p>
      {gate(GATE)}
      {table(["#","Stage","Owner","What happens"],[
        ["1","Bidding","Supplier","Suppliers bid units &amp; price on the client's demand"],
        ["2","Award confirmed","Client","Client confirms the auto-filled cheapest lineup"],
        ["3","Agreements signed","Supplier","Each winner signs their contract of agreement"],
        ["4","Fleet docs uploaded","Supplier","Vehicle / machine papers submitted"],
        ["5","Field verified","Field","On-site inspection passed &amp; signed off"],
        ["6","Permits uploaded","Client","Route permits submitted"],
        ["7","Permits verified","Admin","Compliance confirmed"],
        ["8","Payment uploaded","Client","TT proof submitted — escrow funding"],
        ["9","Escrow confirmed","Admin","Funds recognized as secured"],
        ["10","Executing","Admin","Final approval; work begins"],
        ["11","Completed","—","Sign-off; auto-settlement &amp; invoices"],
      ])}
    '''))

    p.append(content_page("Platform Guide", FOOT, "06", f'''
      {sec_head("04 · Clients", "Post, award, fund, track")}
      {step(1,"Post a job","Choose cargo transport or machinery rental, pick the type, describe the work, set route and quantity.","My Jobs → Post a Job")}
      {step(2,"Award","Suppliers bid; the system fills the cheapest to your quantity at one flat fair price. You confirm.","Auto-fill engine")}
      {step(3,"Permits &amp; payment","After inspection, upload route permits, then fund the escrow with your TT proof.","Stages 6 &amp; 8")}
      {step(4,"Track &amp; sign off","Follow the activity timeline; on completion the system settles and invoices automatically.","Job detail")}
      {sec_head("05 · Suppliers", "List, bid, win, get paid")}
      {step(1,"List your fleet","Add trucks &amp; machinery to your Fleet with honest specs.","Fleet → Add Asset")}
      {step(2,"Bid","Offer per-unit price &amp; quantity on open tenders — partial or full.","Open Tenders")}
      {step(3,"Win &amp; deliver","Sign the agreement, upload fleet docs, pass inspection, then execute once escrow is confirmed.","My Awards")}
      {step(4,"Get paid","Auto-settlement: gross escrow − 10% fee − any parts credit = your payout.","Escrow Vault")}
    '''))

    p.append(content_page("Platform Guide", FOOT, "07", f'''
      {sec_head("06 · Field &amp; Admin", "Verify, confirm, settle")}
      <h3 class="sub-sec">Field — the moat</h3>
      {bul([
        "Inspect each asset on-site: identity, mechanical condition, capacity, legal papers, yard legitimacy.",
        "Match documents to the machine; sign off to advance the gate to <strong>Field verified</strong>.",
        "Log OSBP crossings, wait times and clearance notes in the Border Log.",
      ])}
      <h3 class="sub-sec">Admin — the control desk</h3>
      {bul([
        "Verify the client's route permits (TARURA / TANSAD &amp; corridor entries).",
        "Confirm the TT payment proof so escrow is recognized as secured.",
        "Approve execution to release the supplier; reconcile and settle on completion.",
        "Manage Ground Force deployment and Team roles &amp; access.",
      ])}
      {note("STRICT ORDER", "Admin owns three gate steps (7, 9, 10). Each is rejected by the system unless the prior condition is met.")}
    '''))

    p.append(content_page("Platform Guide", FOOT, "08", f'''
      {sec_head("07 · Money &amp; trust", "Escrow, fee, parts &amp; settlement")}
      <h3 class="sub-sec">Escrow</h3>
      <p>The full contract value is funded before execution. The platform previews it as protected escrow — <strong>funds tracked, not held</strong> — until a licensed escrow partner is integrated. Money moves only on the client's sign-off.</p>
      <h3 class="sub-sec">Fee &amp; settlement</h3>
      {callout("THE FORMULA", "Supplier payout = <strong>Gross escrow</strong> − <strong>AFRIGEN Link 10% service fee</strong> − <strong>emergency parts credit used</strong>. Itemized invoices are generated automatically for both parties.")}
      <h3 class="sub-sec">Emergency parts facility</h3>
      <p>If a supplier breaks down mid-job, the spare can be collateralized against the locked escrow. The system checks coverage, approves the purchase from the Dar wholesale network, and dispatches upcountry by express courier in 12–18 hours. The cost is deducted at settlement.</p>
      {kpis([("7<small>%</small>","Flat fee"),("100<small>%</small>","Escrow-backed"),("11","Gate steps"),("3","Corridors")])}
      {callout("AFRIGEN LINK", "The coordination layer behind every deal — a brand of AFRIGEN Holdings Ltd. <strong>Cargo &amp; Machinery Coordination — Secured.</strong>")}
    '''))
    return doc("AFRIGEN Link — Platform Guide", *p)


BOOKLETS = {
    "01_AFRIGEN-Link_Client_Handbook": client_booklet,
    "02_AFRIGEN-Link_Supplier_Handbook": supplier_booklet,
    "03_AFRIGEN-Link_Field_Manual": field_booklet,
    "04_AFRIGEN-Link_Operations_Manual": admin_booklet,
    "05_AFRIGEN-Link_Company_Overview": company_booklet,
    "06_AFRIGEN-Link_Platform_Guide": combined_booklet,
}

if __name__ == "__main__":
    for name, fn in BOOKLETS.items():
        html = fn()
        with open(f"{OUT}/{name}.html", "w") as f:
            f.write(html)
        print(f"wrote {OUT}/{name}.html  ({len(html)//1024} KB)")
