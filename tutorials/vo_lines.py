"""Line-level VO for AFRIGEN Link role training videos (narration-driven cursor).

Each SEGMENT is broken into ordered LINES. Each line is one sentence-worth of
narration paired with ONE cursor action. We TTS every line separately so we know
its exact spoken duration, then:

  * concatenate the line mp3s -> the segment's full VO (tutorials/vo_roles/<role>/<seg>.mp3)
  * write a per-line timeline (tutorials/vo_lines/<role>/<seg>.json) listing each
    line's action + its exact spoken duration.

During recording the cursor performs action N for exactly line N's spoken length,
so the cursor lands on each element AS the narrator names it — locked by build.

Action grammar (tuple: (text, action, arg)):
  ("hover", "<visible text>")     cursor glides to that text + ripples, holds for the line
  ("hoverbtn", "<button name>")   same, but targets a button by role/name
  ("nav", "<nav label>")          hover a left-rail nav item
  ("type", ("<selector>", "value", nth))  move to field, ripple, type the value
  ("typeph", ("<placeholder substr>", "value"))  type into input by placeholder
  ("selectopt", ("<label>", nth)) move to a <select> and choose option by label
  ("click", "<button name>")      move to + click a button (state-changing action)
  ("upload", "<file key>")        set_input_files on the file input (AGREE/MACH/...)
  ("scroll", dy)                  smooth wheel scroll by dy over the line
  ("hold", None)                  no movement; just dwell (used for read-only lines)

Usage:
  python3 vo_lines.py supplier
"""
import os, subprocess, json, sys

VOICE = "george"
ROOT = "/home/user/afrigen/tutorials"
VO   = f"{ROOT}/vo_roles"     # final per-segment mp3 (consumed by build_role_clips)
LINE = f"{ROOT}/vo_lines"     # per-line timeline json + raw line mp3s

# ----------------------------------------------------------------------
# SUPPLIER — every line paired to a real cursor action on the live UI.
# (segment_id, phase, step, title, [ (text, action, arg), ... ])
# ----------------------------------------------------------------------
SUPPLIER = [
 ("intro", "SUPPLIER", "Your supplier dashboard", "Where your work lives", [
   ("Welcome to AFRIGEN Link.", "hold", None),
   ("If you own trucks or machinery, this is the dashboard that turns your idle assets into paid work, with your money protected.", "nav", "Jobs"),
   ("Start on the Jobs page.", "nav", "Jobs"),
   ("This first counter, Open to bid, shows live jobs you can compete for right now.", "hover", "Open to bid"),
   ("My awards is the work you have already won.", "hover", "My awards"),
   ("Executing is what is moving on the ground today.", "hover", "Executing"),
   ("And Bids placed is how many offers you currently have on the table.", "hover", "Bids placed"),
   ("Over on the left you have four places to work, Jobs, Fleet, Escrow Vault, and Report Breakdown.", "nav", "Fleet"),
   ("We will walk through every single one of them together.", "nav", "Escrow Vault"),
 ]),

 ("open-tenders", "SUPPLIER", "Step 1 — Open Tenders", "Find jobs to bid on", [
   ("Under your counters sits the Open Tenders list.", "hover", "Open Tenders"),
   ("Every job here is one a client has posted that matches what you can carry or operate.", "hover", "Excavator hire"),
   ("Each row tells you the essentials at a glance, what is needed, how many units, and the route.", "hover", "Excavator hire"),
   ("It also tells you whether it is a domestic move or a cross-border one.", "scroll", 150),
   ("Nothing here is hidden, and nothing is first come first served.", "hover", "Grader"),
   ("You read the job, decide if it fits your fleet, and click in to make your offer.", "hover", "Grader"),
   ("Take your time, a good bid starts with reading the job properly.", "scroll", -150),
 ]),

 ("place-bid", "SUPPLIER", "Step 2 — Place a bid", "Offer your price and quantity", [
   ("This is the heart of your work, placing a bid.", "hover", "Place your bid"),
   ("Open a job and you will see the Place your bid card.", "hover", "Place your bid"),
   ("First, set how many units you can supply.", "type", ("input[type=\"number\"]", "2", 0)),
   ("Then set your price per unit.", "type", ("input[type=\"number\"]", "910000", 1)),
   ("Here is what makes AFRIGEN Link fair, you can bid for the full quantity or just part of it.", "hover", "Place your bid"),
   ("If a client needs five trucks and you only have two, you simply bid for two.", "hold", None),
   ("Our system auto-fills the cheapest bids until the quantity is met, then settles everyone onto one flat fair price.", "hold", None),
   ("So you compete on honest pricing, not on who refreshed the page first.", "hoverbtn", "Submit bid"),
   ("Submit your bid, and you can update it any time before the award.", "click", "Submit bid"),
 ]),

 ("my-awards", "SUPPLIER", "Step 3 — My Awards", "The work you've won", [
   ("When a client confirms the award, your job moves into My Awards.", "hover", "My Awards"),
   ("Open it, and the first thing you will notice is the stage tracker.", "hover", "Your award"),
   ("This is your map for the whole job, showing every step from the signed agreement through to execution.", "hover", "flat fair"),
   ("It shows exactly where you are right now.", "scroll", 140),
   ("Below it you will see your award in plain numbers, the units you have been given and the flat fair price per unit.", "hover", "flat fair"),
   ("There are no surprises and no hidden deductions, what you see is what you are contracted for.", "scroll", -140),
 ]),

 ("agreement", "SUPPLIER", "Step 4 — Sign the agreement", "Download, sign, re-upload", [
   ("Your first action on a won job is the agreement.", "hover", "Your award"),
   ("Download the contract of agreement we generate for your share of the work.", "hover", "Signed agreement"),
   ("Read it, sign it, and upload the signed copy back here.", "upload", "AGREE"),
   ("For now this is a deliberate manual step, so there is a real, accountable paper trail behind every job.", "hold", None),
   ("Once your signed agreement is attached, press Confirm agreement signed.", "hoverbtn", "Confirm agreement signed"),
   ("Nothing moves until this is done, and that protects you as much as the client.", "scroll", 120),
 ]),

 ("fleet-docs", "SUPPLIER", "Step 5 — Upload fleet documents", "Prove the asset is real", [
   ("Next gate, your machine and fleet documents.", "hover", "Machine / fleet docs"),
   ("Upload your registration, inspection certificates, and insurance for the asset on this job.", "hover", "registration"),
   ("This is what our field inspector will check against the real machine on the ground, so it has to match.", "upload", "MACH"),
   ("Attach the documents and submit them for inspection.", "hoverbtn", "Submit documents for inspection"),
   ("This step is exactly why a client trusts AFRIGEN Link over a faceless marketplace.", "hold", None),
   ("Every asset is verified by a real person before a shilling moves.", "scroll", 120),
   ("Get it uploaded, and the job heads to field verification.", "scroll", -120),
 ]),

 ("fleet", "SUPPLIER", "Step 6 — Fleet Configuration", "Your assets on file", [
   ("Now let us leave the job and look after your business.", "hover", "Fleet Configuration"),
   ("The Fleet page is where you list every heavy asset you own.", "hover", "Fleet Configuration"),
   ("Keeping it current means you bid faster and look more credible to clients.", "hover", "Assets"),
   ("These counters show your totals, how many assets you have and how many are available.", "hover", "Available"),
   ("They also show how many are active on jobs, and any in breakdown.", "hover", "Breakdown"),
   ("Each asset card carries its engine serial, day rate, and yard location.", "scroll", 170),
   ("Those details make it a verified, trackable machine, not just a line in a spreadsheet.", "scroll", -170),
 ]),

 ("add-asset", "SUPPLIER", "Step 6 — Add an asset", "Register a new machine", [
   ("To add a machine, open Add Asset.", "click", "Add Asset"),
   ("You will pick the type, excavator, prime mover, tipper, and so on.", "selectopt", ("Tipper Truck", 0)),
   ("Then enter the manufacturer and model.", "typeph", ("Caterpillar", "FAW")),
   ("Set your day rate in shillings.", "hold", None),
   ("And crucially, the engine serial and the V.I.N. or chassis number.", "hover", "VIN"),
   ("Those two numbers are the machine's fingerprint, what the field inspector matches on-site.", "hover", "Engine serial"),
   ("Finally, set the yard location where it is based.", "typeph", ("Vingunguti", "Vingunguti yard, Dar")),
   ("Save the asset and it is instantly available to put against new jobs.", "hoverbtn", "Save asset"),
   ("Keep this list honest and complete, it is your shop window.", "hold", None),
 ]),

 ("vault", "SUPPLIER", "Step 7 — Escrow Vault", "See your money before it lands", [
   ("Here is the part suppliers love most, the Escrow Vault.", "hover", "Escrow Vault"),
   ("For every job you win, the client's payment is locked in escrow before the wheels even turn.", "hover", "Escrow Vault"),
   ("So the money is already secured by AFRIGEN Link before you commit your asset.", "scroll", 150),
   ("This table shows, per contract, exactly what is locked.", "hold", None),
   ("It shows any emergency parts credit drawn against it, and your clean net payout once the job is signed off.", "scroll", 150),
   ("You are never chasing an invoice and never wondering if you will be paid.", "scroll", -150),
   ("You can see the money waiting for you from day one.", "hover", "Escrow Vault"),
 ]),

 ("breakdown", "SUPPLIER", "Step 8 — Report Breakdown", "Fill it in, field by field", [
   ("Finally, Report Breakdown, your safety net when a machine goes down mid-job.", "hover", "Report Breakdown"),
   ("Let's fill this form together so you know exactly what to do when it happens.", "hold", None),
   ("First field, the affected contract. Open the dropdown and pick the active job your machine is stranded on.", "selectidx", (0, 1)),
   ("Here I'm selecting the job currently in transit that needs the part.", "hold", None),
   ("Notice it even shows the escrow balance locked on that job, right there in the option.", "hold", None),
   ("Second field, the spare part. Open the parts catalog dropdown.", "selectidx", (1, 1)),
   ("Pick the part that's failed, here, the Hydraulic Pump Assembly.", "hold", None),
   ("The instant you choose it, this cost panel appears, retail price, logistics handling, and the total draw.", "hover", "Total draw"),
   ("It even names the Dar wholesale supplier the part ships from, so nothing is hidden.", "hover", "Source"),
   ("Now AFRIGEN Link checks the locked escrow on that job covers the part and its delivery.", "hold", None),
   ("If it does, you hit Report breakdown and request dispatch, and it's auto-approved.", "hoverbtn", "Report breakdown & request dispatch"),
   ("The part ships up-country by express courier, drawn against the escrow, never your own pocket.", "scroll", 120),
   ("A breakdown that used to cost you days of downtime now costs you minutes.", "scroll", -120),
 ]),

 ("close", "SUPPLIER", "You're set up to win work", "From bid to payout", [
   ("And that is your whole world as a AFRIGEN Link supplier.", "hover", "Open to bid"),
   ("Find the right jobs, bid an honest price, win the work.", "hover", "My awards"),
   ("Sign and verify, then watch your secured payout sit waiting in the vault.", "hover", "Executing"),
   ("With a real safety net if a machine ever falters.", "hover", "Bids placed"),
   ("You compete fairly, you are paid reliably, and you are never left stranded.", "scroll", 150),
   ("Keep your fleet current, bid with confidence, and let AFRIGEN Link handle the trust.", "scroll", -150),
   ("Welcome to the network, let's get your assets earning.", "hold", None),
 ]),
]

# ----------------------------------------------------------------------
# FIELD — the boots-on-ground inspector. Every section + every form field.
# ----------------------------------------------------------------------
FIELD = [
 ("intro", "FIELD", "Your inspector dashboard", "Where on-site work lives", [
   ("Welcome. You are AFRIGEN Link's eyes and hands on the ground, the inspector who makes the whole network trustworthy.", "hold", None),
   ("This is your dashboard, and it has three sections in the left rail.", "hold", None),
   ("Inspections, where jobs wait for you to physically verify a supplier's machine before it can move.", "nav", "Inspections"),
   ("Yard Audits, where you record a full mechanical and legal check of any asset in a supplier's yard.", "nav", "Yard Audits"),
   ("And Border Log, where you record real wait times and clearance overrides at the border posts.", "nav", "Border Log"),
   ("Everything you confirm here unlocks the next stage for the client and the supplier, so accuracy matters.", "scroll", 160),
   ("Nothing moves until you say it's real. Let's walk through each part.", "scroll", -160),
 ]),

 ("awaiting", "FIELD", "Step 1 — The inspection queue", "Jobs waiting for you", [
   ("Start on Inspections. This is your work queue.", "nav", "Inspections"),
   ("Every card here is a job where the supplier has uploaded their fleet documents and is now waiting on you.", "hover", "Awaiting inspection"),
   ("Here's one, an aggregate haul, ready for on-site verification.", "hover", "Aggregate haul"),
   ("Each card shows the route and where it sits on the staged gate.", "hold", None),
   ("Scroll and you'll see any other jobs and exactly which stage each one is in.", "scroll", 160),
   ("The amber Inspect link is how you open a job to begin verifying it.", "scroll", -160),
   ("Let's open this one.", "hover", "Inspect"),
 ]),

 ("open", "FIELD", "Step 2 — Open a job", "What you'll verify", [
   ("Opening a job brings up everything you need before you sign anything off.", "hold", None),
   ("At the top, the job title, the machine type, the units, and the full route.", "hover", "Aggregate haul"),
   ("Below that, the supplier's documents to review, their registration, insurance, and fleet papers.", "hover", "Supplier documents"),
   ("Then your own inspection form, where you capture the V.I.N read and your mechanical notes.", "scroll", 180),
   ("And finally the verify button, which only unlocks once you confirm the inspection passed.", "hover", "Verify & advance"),
   ("So everything you need is on one screen. Let's review the documents first.", "scroll", -180),
 ]),

 ("review-docs", "FIELD", "Step 3 — Review the documents", "Check the paperwork", [
   ("Before you ever touch the machine, you check the supplier's paperwork here.", "hover", "Supplier documents"),
   ("These are the documents the supplier uploaded, their fleet registration and insurance.", "hover", "registration"),
   ("Each one has a View link that opens the actual file in a new tab so you can read it in full.", "hover", "View"),
   ("At the bottom you can see exactly which supplier was awarded, and how many units they're providing.", "hover", "Awarded"),
   ("Your job is to make sure the papers match the machine you're standing in front of.", "scroll", 150),
   ("Once the paperwork checks out, you move to capturing your own findings.", "scroll", -150),
 ]),

 ("verify-vin", "FIELD", "Step 4 — Capture the V.I.N", "Match the machine's fingerprint", [
   ("Now the most important field, the V.I.N or chassis read.", "hover", "VIN / chassis read"),
   ("You physically read the number stamped on the machine and type exactly what you see.", "typeph", ("Capture / type VIN", "VIN read: CAT0320DKMEG01188 — matched chassis plate")),
   ("This is the machine's fingerprint. It must match the registration document you just reviewed.", "hold", None),
   ("If the V.I.N doesn't match, you stop right here, that's a different machine, and the job does not proceed.", "hold", None),
   ("Matching this number is what makes a paper promise into a verified, real asset.", "scroll", 120),
   ("With the V.I.N captured, you record your hands-on mechanical findings.", "scroll", -120),
 ]),

 ("verify-notes", "FIELD", "Step 5 — Mechanical & legal notes", "Write what you found", [
   ("In the notes field you write your honest on-site assessment.", "hover", "Mechanical & legal notes"),
   ("Engine hours, hydraulics, undercarriage wear, leaks, and whether the documents match the machine.", "typeph", ("Hours, hydraulics", "Hydraulics within tolerance. Undercarriage 78% life. Engine hours 4,210. Registration and insurance match the chassis. Legitimacy confirmed.")),
   ("Be specific and be truthful, this note is the record both the client and AFRIGEN Link rely on.", "hold", None),
   ("A good inspector writes what they actually saw, not what's convenient.", "hold", None),
   ("This single note is the difference between a real verification and a rubber stamp.", "scroll", 120),
   ("Once your findings are recorded, you make the final call.", "scroll", -120),
 ]),

 ("verify-advance", "FIELD", "Step 6 — Verify & advance", "Release to the next stage", [
   ("Only when you are genuinely satisfied do you tick this box.", "check", "On-site inspection passed"),
   ("On-site inspection passed, verify and release to the permits stage.", "hold", None),
   ("Notice the Verify button was locked until you ticked it, you cannot advance a job by accident.", "hover", "Verify & advance"),
   ("Press Verify and advance, and the staged gate moves forward for everyone.", "hoverbtn", "Verify & advance"),
   ("The client is now unblocked to upload permits, the supplier knows their machine cleared.", "scroll", 130),
   ("Your signature here is the moment trust becomes real in the system.", "scroll", -130),
 ]),

 ("audits-form", "FIELD", "Step 7 — Yard Audits", "A full asset check", [
   ("Next section, Yard Audits.", "nav", "Yard Audits"),
   ("This is for a deeper, standalone check of any asset in a supplier's yard, not tied to one job.", "hover", "Yard Audit"),
   ("First you choose the asset under inspection from the dropdown.", "selectidx", (0, 1)),
   ("Then you capture the V.I.N photo reference, exactly like in a job inspection.", "typeph", ("Capture / type VIN", "Chassis read matched plate — photo on file")),
   ("Record your mechanical notes, hours, hydraulics, undercarriage, leaks.", "typeph", ("Hours, hydraulics", "Full yard check: hydraulics good, no leaks, undercarriage healthy, papers in order.")),
   ("Then tick to confirm the asset's legitimacy is verified.", "check", "legitimacy verified"),
   ("And sign off the audit, which permanently records this asset as inspected.", "hoverbtn", "Sign off audit"),
 ]),

 ("audits-history", "FIELD", "Step 8 — Audit history", "Your track record", [
   ("Below the form is your recent audits list.", "hover", "Recent audits"),
   ("Every audit you sign off is logged here with its notes, building a permanent inspection trail.", "scroll", 160),
   ("This history is what gives suppliers and clients confidence that checks really happened.", "scroll", -160),
   ("It's also your own record of the work you've done on the ground.", "hover", "Recent audits"),
 ]),

 ("border-form", "FIELD", "Step 9 — Border Log", "Record what happens at the border", [
   ("Last section, the Border Liaison Log.", "nav", "Border Log"),
   ("When you're stationed at a border post, you record the reality on the ground here.", "hover", "Border Liaison Log"),
   ("First, pick which One-Stop Border Post you're at, Tunduma, Namanga, Rusumo, or Kabanga.", "selectidx", (0, 1)),
   ("Then log the institutional wait time in minutes, the real delay the cargo faced.", "typeph", ("e.g. 180", "240")),
   ("And write a clearance override note, what went wrong and how you resolved it in person.", "typeph", ("Portal failure", "TANSAD portal failed mid-clearance. Re-validated manually with the customs desk; convoy released after 4 hours.")),
   ("Then log the entry. This is your physical moat made visible.", "hoverbtn", "Log entry"),
 ]),

 ("border-history", "FIELD", "Step 10 — Border history & close", "Why your work matters", [
   ("Below, every border entry you've logged is recorded with its wait time and resolution.", "scroll", 160),
   ("This data is gold, it tells AFRIGEN Link which corridors are slow and where to station liaison agents.", "scroll", -160),
   ("And that is your whole role, three sections, one mission.", "nav", "Inspections"),
   ("Verify machines on site, audit yards in depth, and keep the borders moving.", "nav", "Yard Audits"),
   ("You are the reason a client can trust a machine they've never seen, and a supplier can trust they'll be paid.", "nav", "Border Log"),
   ("Be thorough, be honest, and the whole network holds. Welcome to the ground force.", "hold", None),
 ]),
]


CLIENT = [
 ("intro", "CLIENT", "Your client dashboard", "Where your jobs live", [
   ("Welcome to AFRIGEN Link. You're the client, the one who needs trucks or machinery and wants it done without the usual risk.", "hold", None),
   ("This is your dashboard. It's deliberately simple, just two sections in the left rail.", "hold", None),
   ("My Jobs, where every demand you've posted lives and where you track its progress.", "nav", "My Jobs"),
   ("And Post a Job, where you tell us what you need and let suppliers compete for it.", "nav", "Post a Job"),
   ("Everything you do flows through these two screens, so let's start by understanding what a job actually is.", "nav", "My Jobs"),
   ("Think of AFRIGEN Link as the trusted middle. You post once, we coordinate the rest.", "hold", None),
 ]),

 ("read-stage", "CLIENT", "Reading your jobs", "The staged gate", [
   ("Here on My Jobs you'll see every demand you've posted, each as its own card.", "hover", "My Jobs"),
   ("A card shows the job title, what you need, how many units, and the route.", "hold", None),
   ("And this bar across the card is the staged gate, the heart of how AFRIGEN Link protects you.", "hover", "Bidding"),
   ("Every job moves through fixed stages in order, bidding, award, agreements, inspection, permits, payment, and execution.", "hold", None),
   ("Nothing skips ahead. A machine cannot move until it has been inspected, and money is only released when work is signed off.", "scroll", 150),
   ("This is the difference between AFRIGEN Link and a simple marketplace, the gate enforces trust, it doesn't just connect you.", "hold", None),
   ("So at a glance you always know exactly where your job stands. Now let's post one.", "scroll", -150),
 ]),

 ("post-type", "CLIENT", "Step 1 — Post a job", "Tell us what you need", [
   ("Click Post a Job, and you're asked the first question, what do you need?", "nav", "Post a Job"),
   ("Two choices. Cargo transport, when you need trucks to move sand, aggregate, or goods.", "hover", "Cargo transport"),
   ("Or Machinery rental, when you need heavy equipment for a project or site.", "hover", "Machinery rental"),
   ("Let's say we need an excavator for some earthworks, so we choose Machinery rental.", "click", "Machinery rental"),
   ("Notice how the form adapts to your choice, asking only what's relevant.", "hold", None),
   ("If you'd picked Cargo transport instead, we'd ask about carrier type and the cargo to move. Same simple flow, either way.", "hover", "Cargo transport"),
   ("Choosing the right category up front means suppliers see exactly the kind of work it is, and bid accurately.", "hover", "Machinery rental"),
 ]),

 ("post-details", "CLIENT", "Step 2 — The details", "Type, units, route", [
   ("First, the machine type. You pick from the dropdown of equipment we coordinate.", "selectidx", (0, 1)),
   ("Then how many units you need. This is the demand, you can ask for two, five, ten machines at once.", "typenum", ("2",)),
   ("Next, describe the project so suppliers understand the job.", "typeph", ("earthworks", "Bulk earthworks and trenching for a warehouse foundation")),
   ("Then choose whether it's a domestic move or cross-border, which changes the permits we prepare.", "hold", None),
   ("And the destination, where the machine needs to be.", "typeph", ("e.g. Geita", "Dodoma")),
   ("You can give it a title, or leave it blank and we'll generate one for you.", "hold", None),
 ]),

 ("post-submit", "CLIENT", "Step 3 — Open for bids", "Suppliers compete", [
   ("When you're ready, you post the job and open it for bids.", "hoverbtn", "Post job & open for bids"),
   ("This is the moment your single demand goes out to every qualified supplier on the network.", "hold", None),
   ("Here's what makes AFRIGEN Link different, you don't chase suppliers, they come to you and compete on price.", "hold", None),
   ("Suppliers can bid for your full quantity, or just part of it, and we auto-fill the cheapest combination.", "hold", None),
   ("Then we set one flat fair price that every awarded supplier agrees to, so you never overpay.", "hold", None),
   ("Once posted, the job appears back on My Jobs in the bidding stage, waiting for offers.", "nav", "My Jobs"),
 ]),

 ("bids-award", "CLIENT", "Step 4 — Review bids & award", "Auto-fill the best price", [
   ("Open a job that's received bids, and you'll see them listed here.", "hover", "Bids ("),
   ("Each row shows a supplier, how many units they'll provide, and their price per unit.", "hover", "Price / unit"),
   ("You don't have to negotiate. AFRIGEN Link auto-fills the cheapest bids until your quantity is met.", "hover", "Supplier"),
   ("It combines bids until your full quantity is covered, then settles on one flat fair rate every awarded supplier accepts.", "hover", "auto-fill cheapest"),
   ("All you do is confirm the award. That single click locks in your suppliers and your price.", "hoverbtn", "Confirm award"),
   ("Because suppliers compete, you get a genuinely fair market price, not whatever one operator decides to charge you.", "hover", "Activity"),
   ("From here the staged gate takes over, protecting you at every step.", "hover", "Status"),
 ]),

 ("awarded", "CLIENT", "Step 5 — Awarded & verified", "Agreements and inspection", [
   ("Once awarded, you can see exactly which suppliers won, listed right here.", "hover", "Awarded Suppliers"),
   ("And this is the flat fair price per unit that every awarded supplier agreed to.", "hover", "Flat fair price"),
   ("Each awarded supplier signs their own agreement for their share of your demand.", "hover", "Status"),
   ("Then they upload their fleet documents, which you can track in the documents panel.", "hover", "Documents"),
   ("A AFRIGEN Link field inspector then physically verifies the machine on site, and you watch it advance in the activity log.", "hover", "Activity"),
   ("That inspection is your protection, you're never paying for a machine nobody has seen.", "hover", "Status"),
   ("Splitting your demand across several suppliers also protects you, if one falls short, the others still carry the job.", "hover", "Awarded Suppliers"),
   ("When the field inspection clears, the next action is yours, the permits.", "scroll", 130),
 ]),

 ("permits", "CLIENT", "Step 6 — Upload permits", "Clear the paperwork", [
   ("Now the gate hands you your step, uploading the transit permits.", "hover", "Your step — Upload permits"),
   ("These are the road and transit clearances the cargo or machine needs to move legally.", "hover", "Transit permits"),
   ("You attach the permit document right here, simply and securely.", "hover", "Transit permits"),
   ("Then you submit it for verification, where our admin team checks it before anything proceeds.", "hoverbtn", "Submit permits for verification"),
   ("This keeps you compliant, no convoy moves on paperwork that hasn't been checked.", "hover", "Documents"),
   ("Why does AFRIGEN Link gate this? Because an uncleared load can be turned back at a checkpoint, costing you days and money.", "hover", "Activity"),
   ("By checking permits before the machine moves, we stop those problems before they ever start.", "hover", "Your step — Upload permits"),
   ("Once permits are verified, the final step is yours, the payment.", "hover", "Status"),
 ]),

 ("payment", "CLIENT", "Step 7 — Payment & escrow", "Funds tracked, not held", [
   ("With permits verified, you reach the payment step.", "hover", "Your step — Payment proof"),
   ("Here you see the escrow preview, the total amount for your job, held by AFRIGEN Link.", "hover", "Escrow preview"),
   ("This is the trust layer. Your money sits with AFRIGEN Link as escrow, it is tracked, not released, until work is signed off.", "hover", "Escrow preview"),
   ("You upload your T.T payment proof, the bank transfer confirmation, right here.", "hover", "Your step — Payment proof"),
   ("Then submit it. Our admin confirms the funds, and only then does the job move to execution.", "hoverbtn", "Submit payment proof"),
   ("This solves the oldest problem in this business, suppliers fear they won't be paid, clients fear they'll pay and get nothing.", "hover", "Activity"),
   ("Escrow removes both fears at once, the money is real and visible, but locked until the work is done.", "hover", "Escrow preview"),
   ("The supplier knows the money is secured, you know it won't be released until the job is done. Everyone's protected.", "hover", "Status"),
 ]),

 ("track", "CLIENT", "Step 8 — Track to completion", "Watch it finish", [
   ("Back on My Jobs, you simply watch the staged gate march to completion.", "nav", "My Jobs"),
   ("Award, agreements, inspection, permits, payment, and finally execution, every stage visible.", "hover", "My Jobs"),
   ("You never have to phone around or wonder where things stand, the dashboard always tells you.", "hold", None),
   ("When the work is signed off, AFRIGEN Link settles the suppliers and the job closes, cleanly.", "hold", None),
   ("And if something ever goes wrong on the ground, our field and admin teams act, you're never left chasing a supplier alone.", "hold", None),
   ("That's the whole point, you post once, and a verified, escrow-protected job runs itself.", "scroll", 140),
 ]),

 ("close", "CLIENT", "You're in control", "Welcome to AFRIGEN Link", [
   ("So that's your dashboard, two screens, one protected journey.", "nav", "My Jobs"),
   ("Post what you need, let suppliers compete, confirm your award.", "nav", "Post a Job"),
   ("Then upload permits, fund the escrow, and watch the staged gate carry it to completion.", "nav", "My Jobs"),
   ("Every step is checked, every machine is inspected, and your money is protected until the work is done.", "hold", None),
   ("That's the AFRIGEN Link promise, you bring the demand, we coordinate the trust. Welcome aboard.", "hold", None),
 ]),
]


# ----------------------------------------------------------------------
# ADMIN — the AFRIGEN Link HQ control desk. Walks every section: Overview, Jobs,
# the three gated admin actions (verify permits, confirm payment, approve
# execution), Ground Force, Verification, Team & Access, Notifications, Ledger.
# Teaching tone: explain WHY each desk exists, not just what to click.
# ----------------------------------------------------------------------
ADMIN = [
 ("intro", "ADMIN", "The AFRIGEN Link control desk", "Where the corridor is run", [
   ("Welcome to the AFRIGEN Link admin dashboard, the control desk for the whole corridor.", "hold", None),
   ("If the client posts the demand and the supplier carries it, this is where AFRIGEN Link holds the trust between them.", "hold", None),
   ("Everything that protects both sides, escrow, permit checks, field verification, settlement, is operated from these screens.", "nav", "Overview"),
   ("On the left you have seven desks, Overview, Jobs, Ground Force, Verification, Team, Notifications, and Ledger.", "nav", "Jobs"),
   ("We will work through every single one, so you understand not just what each button does, but why it exists.", "nav", "Overview"),
   ("Let's begin where every shift begins, the Overview.", "nav", "Overview"),
 ]),

 ("overview", "ADMIN", "Desk 1 — Overview", "The live operating picture", [
   ("This is your Operations Overview, the live picture across the corridor at a glance.", "hover", "Operations Overview"),
   ("It's the first thing you open at the start of a shift, because it answers the only questions that really matter.", "hover", "Operations Overview"),
   ("How much money are we holding, how much have we earned, and how many jobs are in motion.", "hover", "Live operating picture"),
   ("The first figure, Locked Escrow, is the total client money AFRIGEN Link is currently holding in trust.", "hover", "Locked Escrow"),
   ("This is the heart of the model, that money is real and tracked, but not released until work is signed off.", "hover", "Locked Escrow"),
   ("Platform Revenue is the seven percent service fee AFRIGEN Link earns once jobs settle.", "hover", "Platform Revenue"),
   ("That single fee is how AFRIGEN Link makes its money, fairly and transparently, the same percentage on every deal.", "hover", "Platform Revenue"),
   ("Then your counts, active contracts on the network, and the suppliers registered to carry them.", "hover", "Contracts"),
   ("Assets shows how much verified machinery and how many trucks are available across your suppliers.", "hover", "Suppliers"),
   ("And Breakdowns, which turns amber the moment a machine reports a fault in the field.", "hover", "Breakdowns"),
   ("When that counter lights up, you know a job needs attention before it stalls.", "hover", "Breakdowns"),
   ("Below the counters sits every contract in the system, with its route, escrow, fee, and status.", "hover", "All contracts"),
   ("Each row tells you whether it's a domestic move or a cross-border one, and where it stands in its life cycle.", "hover", "Route"),
   ("In one screen you can see exactly how much money is in trust and where every job stands.", "scroll", 160),
 ]),

 ("jobs", "ADMIN", "Desk 2 — Jobs", "Where you action the gate", [
   ("Next is the Jobs desk, every job across the corridor in one list.", "nav", "Jobs"),
   ("This is where most of your work happens, so it's worth understanding exactly how it's laid out.", "hover", "Jobs"),
   ("This banner at the top is the most important thing on the page, it tells you how many jobs are waiting for your action right now.", "hover", "awaiting your action"),
   ("Think of it as your to-do list, if that banner is empty, every job is moving on its own.", "hover", "awaiting your action"),
   ("AFRIGEN Link controls three gates, verifying permits, confirming payment, and approving execution. Nothing moves past them without you.", "hover", "verify permits, confirm payment, approve execution"),
   ("Those three gates are the entire reason clients and suppliers trust this platform, so we'll action all three.", "hover", "Jobs"),
   ("Any job needing your hand is flagged with an amber action tag, so you never miss one in the list.", "hover", "action"),
   ("Each row also carries its own stage tracker, showing exactly how far along that job is at a glance.", "hover", "Bidding"),
   ("So you can scan the whole corridor and instantly see what's waiting, what's moving, and what's done.", "hover", "Bidding"),
   ("Let's open a job that's waiting on us, and action it properly.", "hover", "action"),
 ]),

 ("verify-permits", "ADMIN", "Desk 2 — Gate 1: Permits", "Check the paperwork", [
   ("This job has reached the permits gate, and the action card at the top tells you exactly what's needed.", "hover", "Action required"),
   ("Before you do anything, glance at the stage tracker, it confirms the job has cleared inspection and is now waiting on permits.", "hover", "Action required"),
   ("The client has uploaded their transit permits, and now it's your job to confirm they're valid before anything moves.", "hover", "Confirm the uploaded permits are valid"),
   ("Open the documents panel and you can view every permit they've attached.", "hover", "Documents"),
   ("You'd open each one, check the route, the dates, and the load details against what the job actually requires.", "hover", "Documents"),
   ("Then you mark each document verified once you're satisfied it's genuine.", "hover", "mark verified"),
   ("Why does AFRIGEN Link gate this? Because an uncleared load can be turned back at a checkpoint, costing everyone days and money.", "hover", "Documents"),
   ("No convoy should ever roll on paperwork nobody has checked, and this is where you stop that from happening.", "hover", "Action required"),
   ("When the permits check out, you release the job with a single click.", "hoverbtn", "Verify permits & release"),
   ("That moves the job to its next gate, the payment, where the money becomes real.", "hover", "Activity"),
 ]),

 ("confirm-payment", "ADMIN", "Desk 2 — Gate 2: Payment", "Confirm the escrow", [
   ("Here is the gate that makes AFRIGEN Link different from any ordinary broker, confirming the payment.", "hover", "Action required"),
   ("The client has uploaded their T.T proof, the bank transfer that funds the entire job.", "hover", "Confirm the TT proof"),
   ("This panel shows you the exact escrow amount to confirm, held by AFRIGEN Link on the client's behalf.", "hover", "Escrow to confirm"),
   ("This is the trust layer, the single biggest reason both sides use the platform.", "hover", "Escrow to confirm"),
   ("The supplier can see the money is real and secured, but it stays locked until the work is actually done.", "hover", "Escrow to confirm"),
   ("You open the documents panel and check the T.T proof against the figure shown on screen.", "hover", "Documents"),
   ("You're confirming the amount matches, the reference is right, and the funds have genuinely landed.", "hover", "Documents"),
   ("Once the funds match, you confirm payment received, and the escrow is officially recorded as held by AFRIGEN Link.", "hoverbtn", "Confirm payment received"),
   ("Now both sides are protected, the client's money is safe, and the supplier knows it's there waiting for them.", "hover", "Activity"),
 ]),

 ("approve-execute", "ADMIN", "Desk 2 — Gate 3: Execute", "Release the work", [
   ("With permits cleared and payment confirmed, the job reaches its final gate, approval to execute.", "hover", "Action required"),
   ("This is the green light, authorising the supplier and the field force to begin the work on the ground.", "hover", "Authorise the supplier and field force"),
   ("Take a moment here, because this is the point of no return, after this the machines move.", "hover", "Action required"),
   ("By now everything is verified, the machine inspected on site, the permits checked, the money held in escrow.", "hover", "Escrow"),
   ("You can see the escrow is now recorded as held by AFRIGEN Link, so the supplier is guaranteed payment.", "hover", "Held by AFRIGEN Link"),
   ("Only when every single safeguard is in place do you release the job.", "hoverbtn", "Approve to execute"),
   ("That one approval turns a careful paperwork process into a moving convoy, with full protection behind it.", "hover", "Held by AFRIGEN Link"),
   ("And from here, the field force takes over on the ground, while you watch the job run to completion.", "hover", "Activity"),
 ]),

 ("ground-force", "ADMIN", "Desk 3 — Ground Force", "The physical moat", [
   ("Next is Ground Force, the physical moat that no software-only competitor can copy.", "nav", "Ground Force"),
   ("Anyone can build a website, but only AFRIGEN Link puts real people next to the machines and at the borders.", "hover", "the physical moat"),
   ("On the left, every field inspection your inspectors have carried out, with their notes and sign-off status.", "hover", "Field inspections"),
   ("Each entry is a real person who stood next to a machine and confirmed it exists and actually works.", "hover", "Field inspections"),
   ("The status pill tells you whether each inspection is still pending or fully verified.", "hover", "Field inspections"),
   ("On the right, the border logs, recorded by your liaison agents stationed at the crossings.", "hover", "Border logs"),
   ("They capture the institutional wait time at each post, and it turns amber when a crossing is stalling.", "hover", "Border logs"),
   ("This is how AFRIGEN Link turns up at the border in person, instead of leaving a supplier stranded at a portal failure.", "hover", "Border logs"),
   ("Boots on the ground is the moat, and this desk is where you watch it work, shift after shift.", "scroll", 120),
 ]),

 ("verification", "ADMIN", "Desk 4 — Verification", "Vet your suppliers", [
   ("The Verification desk is where you vet the suppliers who want to work on the network.", "nav", "Verification"),
   ("This is your first line of defence, no supplier should ever reach a client unchecked.", "hover", "Verification Queue"),
   ("Every supplier shows their current status, and field audits on the ground drive these approvals.", "hover", "Verification Queue"),
   ("You can see their company name, their contact, and any notes the field team has left after visiting them.", "hover", "no notes"),
   ("The status pill tells you instantly whether they're pending, audited, or fully approved.", "hover", "Verification Queue"),
   ("Once a supplier has been physically audited on the ground, you mark them audited here.", "hoverbtn", "Mark Audited"),
   ("And when they fully meet the standard, you approve them to bid on real jobs.", "hoverbtn", "Approve"),
   ("This gate is exactly why a client never deals with an unvetted operator, because you've already checked them.", "hover", "Verification Queue"),
 ]),

 ("team", "ADMIN", "Desk 5 — Team & Access", "Control who gets in", [
   ("The Team and Access desk controls who can do what inside AFRIGEN Link.", "nav", "Team"),
   ("Every user in the system is listed here, with their email, verification status, and role.", "hover", "Team & Access"),
   ("This is your security desk, so it's worth understanding the rules built into it.", "hover", "Team & Access"),
   ("You can change a user's role from this dropdown, granting or revoking their access in one move.", "hover", "Role"),
   ("But notice the rule, admins and field force are internal roles, they can never be self-assigned.", "hover", "never self-assigned"),
   ("That stops anyone signing up and quietly handing themselves control of the platform.", "hover", "never self-assigned"),
   ("And the super-admin account is locked, so no one, not even another admin, can downgrade the owner.", "hover", "super-admin"),
   ("This is how AFRIGEN Link stays secure, access is granted deliberately, never by accident.", "hover", "you"),
 ]),

 ("notifications", "ADMIN", "Desk 6 — Notifications", "Every message on record", [
   ("The Notifications desk is the on-record log of every message the system sends.", "nav", "Notifications"),
   ("Every award, every stage change, every confirmation is captured here, with its recipient and channel.", "hover", "On-record notification log"),
   ("You can see exactly who was told what, and whether it went by email or another channel.", "hover", "email"),
   ("Right now these are logged for the record, real email and S.M.S delivery activates later as we scale.", "hover", "Real email"),
   ("But the principle matters today, nothing is sent in the dark, every communication is auditable.", "hover", "On-record notification log"),
   ("If a client or supplier ever asks what they were told and when, the answer is right here.", "scroll", 140),
   ("Transparency is part of the trust AFRIGEN Link sells, and this desk keeps the receipts.", "scroll", -120),
 ]),

 ("ledger", "ADMIN", "Desk 7 — Master Ledger", "Where the money settles", [
   ("Finally, the Master Ledger, the settlement record across every contract.", "nav", "Ledger"),
   ("Currently Locked shows the escrow AFRIGEN Link is holding right now, across all live jobs.", "hover", "Currently Locked"),
   ("Platform Revenue is the seven percent AFRIGEN Link has earned from settled work.", "hover", "Platform Revenue"),
   ("Parts Credit Extended tracks any emergency spare parts AFRIGEN Link advanced against escrow to keep a job moving.", "hover", "Parts Credit Extended"),
   ("And Settled Contracts counts the jobs fully paid out and closed.", "hover", "Settled Contracts"),
   ("Below, every contract shows its escrow, our fee, any parts credit, and the final supplier payout.", "hover", "Supplier Payout"),
   ("When a job is signed off, the split is automatic, supplier payout equals escrow, minus our fee, minus any parts credit.", "hover", "Fee"),
   ("No chasing, no disputes over numbers, the ledger settles everyone cleanly.", "scroll", 150),
 ]),

 ("close", "ADMIN", "You run the corridor", "Welcome to AFRIGEN Link HQ", [
   ("So that's the control desk, seven screens that run the entire corridor.", "nav", "Overview"),
   ("Overview shows you the money and the jobs, and the Jobs desk is where you action the three gates.", "nav", "Jobs"),
   ("Ground Force is your boots on the ground, and Verification keeps every supplier vetted.", "nav", "Ground Force"),
   ("Team controls access, Notifications keep the record, and the Ledger settles every shilling.", "nav", "Ledger"),
   ("Every gate you hold protects both the client and the supplier, that is the whole job.", "hold", None),
   ("You bring the discipline, the platform brings the structure. Welcome to AFRIGEN Link HQ.", "hold", None),
 ]),
]


SCRIPTS = {"supplier": SUPPLIER, "field": FIELD, "client": CLIENT, "admin": ADMIN}


def tts(text, out):
    subprocess.run(["say", "-v", VOICE, text, "-o", out], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def dur(f):
    return float(subprocess.check_output(
        ["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",f]).strip())

def build(role):
    segs = SCRIPTS[role]
    vo_dir   = f"{VO}/{role}";   os.makedirs(vo_dir, exist_ok=True)
    line_dir = f"{LINE}/{role}"; os.makedirs(line_dir, exist_ok=True)
    seg_meta = []   # for build_role_clips _durs.json compatibility
    for sid, phase, step, title, lines in segs:
        ld = f"{line_dir}/{sid}"; os.makedirs(ld, exist_ok=True)
        timeline = []
        mp3s = []
        for i, (text, action, arg) in enumerate(lines):
            mp3 = f"{ld}/{i:02d}.mp3"
            tts(text, mp3)
            d = round(dur(mp3), 3)
            timeline.append({"i": i, "text": text, "action": action, "arg": arg,
                             "mp3": mp3, "dur": d})
            mp3s.append(mp3)
        # concat the line mp3s into the segment VO (silence-free join)
        seg_mp3 = f"{vo_dir}/{sid}.mp3"
        concat_list = f"{ld}/_concat.txt"
        with open(concat_list, "w") as f:
            for m in mp3s: f.write(f"file '{m}'\n")
        subprocess.run(["ffmpeg","-y","-f","concat","-safe","0","-i",concat_list,
                        "-c","copy",seg_mp3], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        seg_dur = round(dur(seg_mp3), 2)
        # per-line timeline (consumed by the recorder)
        with open(f"{line_dir}/{sid}.json", "w") as f:
            json.dump({"id": sid, "phase": phase, "step": step, "title": title,
                       "seg_dur": seg_dur, "lines": timeline}, f, indent=2)
        seg_meta.append({"id": sid, "phase": phase, "step": step, "title": title,
                         "mp3": seg_mp3, "dur": seg_dur})
        print(f"  {role}/{sid}: {len(lines)} lines  {seg_dur:.1f}s")
    # _durs.json for build_role_clips.py
    with open(f"{vo_dir}/_durs.json", "w") as f:
        json.dump(seg_meta, f, indent=2)
    total = sum(m["dur"] for m in seg_meta)
    print(f"{role} total VO: {total:.1f}s (~{total/60:.1f} min before cards)")

if __name__ == "__main__":
    role = sys.argv[1] if len(sys.argv) > 1 else "supplier"
    build(role)
