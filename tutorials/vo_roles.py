"""Per-role training VO scripts for Nguzo. george voice, teaching tone.
Generates tutorials/vo_roles/<role>/<segment>.mp3 and a _durs.json with lengths.

Usage:
  python3 vo_roles.py field
"""
import os, subprocess, json, sys

VO = "/home/user/afrigen/tutorials/vo_roles"
VOICE = "george"
os.makedirs(VO, exist_ok=True)

# Each entry: (segment_id, caption_phase, caption_step, caption_title, narration)
FIELD = [
    ("intro", "FIELD AGENT", "Your dashboard",
     "Inspections",
     "Welcome to the Nguzo Field Agent dashboard. Before we click anything, understand who you "
     "are in this company. You are the part of Nguzo that a software competitor can never copy — "
     "a real person, on the ground, who looks a machine in the eye and confirms it is genuine "
     "before a single shilling moves. A passive marketplace just connects two strangers and hopes "
     "for the best. We don't. We send you. Your home screen is called Inspections, and it is split "
     "into two lists. At the very top sit the jobs waiting for you right now — these are urgent. "
     "Below them sit the other active jobs, so you always have a clear picture of everything moving "
     "through the pipeline, even the work that isn't yours yet."),
    ("awaiting", "FIELD AGENT", "Reading the queue",
     "What's waiting for you",
     "Look closely at this top section, Field Inspections. Every card here is a job where the "
     "supplier has already been awarded, has signed their agreement, and has uploaded their fleet "
     "documents. The system has done everything it can digitally — now it is physically blocked, "
     "waiting on you. Each card tells you the machine type, how many units are involved, and the "
     "route from origin to destination, so you know what you're walking into before you ever leave "
     "the office. An amber highlight means this one needs you today."),
    ("open", "FIELD AGENT", "Step 1 — Open a job",
     "Opening an inspection",
     "Let's open one. Click the Inspect button on the job card. This takes you into the inspection "
     "workspace for that specific tender. Remember the golden rule of your role: nothing in this deal "
     "moves forward until you have stood in the yard and signed it off. The client's money is sitting "
     "in escrow right now, and your inspection is the gate that protects it. No inspection, no release. "
     "That is the whole reason your role exists."),
    ("review-docs", "FIELD AGENT", "Step 2 — Read the paperwork",
     "Check the documents first",
     "Before you even look at the machine, study what the supplier submitted. On this page you'll find "
     "their signed transport agreement and their fleet registration documents. Open each one and read it "
     "properly — don't skim. Note the chassis number printed on the registration, the declared make and "
     "model, and the ownership details. You'll also see which supplier was awarded this job and exactly "
     "how many units they promised to provide. Your job on site is simple to say and vital to do: confirm "
     "that the real, physical machine in front of you matches this paperwork, line for line."),
    ("verify-vin", "FIELD AGENT", "Step 3 — Capture the VIN",
     "Read the chassis number",
     "Now you're at the yard, standing in front of the machine. Find the VIN, the chassis number, stamped "
     "on the equipment itself, and type exactly what you read into this field. Do not copy it from the "
     "document. Read it off the metal. This single habit is how we catch the oldest trick in the trade: a "
     "supplier showing clean paperwork for one machine, then delivering a worse one. If the number on the "
     "chassis doesn't match the number on the registration, you stop right here and you flag it."),
    ("verify-notes", "FIELD AGENT", "Step 3 — Record condition",
     "Write honest mechanical notes",
     "Next, the mechanical and legal notes. This is where your expertise earns its keep. Record the true "
     "condition of the machine: the engine hours on the meter, the state of the hydraulics, the "
     "undercarriage and tyres, any leaks, and whether the ownership documents are genuine and current. "
     "Be specific and be honest — a future dispute may be settled by exactly what you write here, so write "
     "it as if it will be read aloud. Vague notes protect no one. Detailed notes protect everyone, including "
     "you."),
    ("verify-advance", "FIELD AGENT", "Step 3 — Sign and advance",
     "Verify and advance",
     "Only when you are genuinely satisfied — VIN matches, condition is acceptable, documents are real — do "
     "you tick the confirmation box. This tick is your signature. It means you personally vouch for this "
     "machine. Then press Verify and advance. Watch what happens: the job immediately moves out of your "
     "queue and into the permits stage, and the whole team is notified. Never, ever tick that box from a "
     "desk without seeing the machine. Your word is the product Nguzo sells."),
    ("audits-form", "FIELD AGENT", "Yard Audits",
     "Standalone yard checks",
     "Now let's leave the job flow and look at your second tool: Yard Audits. This screen is for inspecting "
     "a supplier's assets directly, outside of any single job — most often when a brand-new supplier joins "
     "and wants their fleet verified before they ever bid. Let's run one. First, pick the asset under "
     "inspection from this list — you can see the type, the make and model, and which yard it sits in. "
     "Then read and enter the VIN, just like before. Write your mechanical notes. And when the asset checks "
     "out, tick Asset legitimacy verified and press Sign off audit."),
    ("audits-history", "FIELD AGENT", "Yard Audits",
     "The permanent record",
     "Watch the Recent audits list below the form. The audit you just signed off now appears here, stamped "
     "with the date and a Verified badge. This is a permanent record. Anyone on the team — sales, admin, "
     "the client's account manager — can see at a glance which of a supplier's assets have actually been "
     "touched by a human and when. This history is what lets us put a verified badge on a supplier with full "
     "confidence, because every badge traces back to a real visit logged right here."),
    ("border-form", "FIELD AGENT", "Border Liaison Log",
     "Log a clearance",
     "Your third responsibility lives on the Border Liaison Log. When a load crosses at a one-stop border "
     "post — Tunduma into Zambia, Namanga toward Kenya, Rusumo toward Rwanda — and the clearance portal "
     "stalls or the bureaucracy freezes, you are the person who fixes it in person. Let's log one. Choose "
     "the border post from the list. Enter how long the institutional wait actually lasted, in minutes — be "
     "accurate, this number is data we use to negotiate and to warn clients. Then write the override note: "
     "exactly how you got the load moving. Press Log entry."),
    ("border-history", "FIELD AGENT", "Border Liaison Log",
     "Proof the corridor moves",
     "And there it is in the Recent logs list — the post, the wait time, and your note, on the record "
     "forever. Long waits over two hours are flagged in amber so management can spot a problem corridor "
     "instantly. These logs are gold. They are living proof that our corridors keep moving even when the "
     "government systems don't — a promise no app on a phone can ever make, because it takes a person at the "
     "border to make it true. So that is your full role, end to end: inspect machines before money moves, "
     "audit supplier yards to earn their verified badge, and keep the corridors open when the systems fail. "
     "You are the boots on the ground that make Nguzo trustworthy. Welcome to the team."),
]

CLIENT = [
    ("intro", "CLIENT", "Your dashboard",
     "My Jobs",
     "Welcome to Nguzo Africa. You're here because you need something heavy moved or built — trucks "
     "to haul your cargo, or machinery for your site — and you want it done without the usual fear: "
     "the supplier who vanishes, the deposit that disappears, the machine that turns up half the size "
     "you were promised. Nguzo exists to remove that fear completely. This is your home screen, called "
     "My Jobs. Across the top you have four simple counters — your total jobs, how many are taking bids "
     "right now, how many are in execution, and how many are completed. Below that sits the list of every "
     "job you've posted. Each one shows you exactly which stage it has reached, on a single tracker, so "
     "you are never left wondering what is happening with your money or your machine."),
    ("read-stage", "CLIENT", "Reading a job",
     "The stage tracker",
     "Before we post anything, learn to read this tracker, because it is the heart of how Nguzo protects "
     "you. Every job moves through the same fixed sequence of gates: bidding, award, signed agreements, "
     "fleet documents, field inspection, permits, payment, and finally execution. The key thing to "
     "understand is that no step can be skipped and no step can jump ahead. The supplier cannot get paid "
     "before a real inspector has stood in the yard. Your money is never released until the job is verified. "
     "This tracker is your guarantee, made visible. Notice too whether a job is marked Domestic or "
     "Cross-Border — that single tag changes which permits and clearances the system will ask for later."),
    ("post-type", "CLIENT", "Step 1 — Post a job",
     "What do you need?",
     "Let's post a real job together. Click Post a Job. The very first choice is the most important: what do "
     "you actually need? Machinery — an excavator, a grader, a roller for a project — or a cargo carrier — a "
     "tipper, a flatbed, a tanker to move a load. Pick the one that matches your need, and the form intelligently "
     "adjusts the options beneath it. Take your time here; getting this right means the right suppliers see your "
     "job and bid on it."),
    ("post-details", "CLIENT", "Step 1 — Describe it",
     "Type, quantity, and route",
     "Now fill in the detail. Choose the exact carrier or machine type from the list. Then — and this is what "
     "makes Nguzo different — tell us how many units you need. You're not booking a single truck; you can post "
     "demand for a whole fleet at once, and multiple suppliers can each take a share. Describe what you're moving "
     "or building, so suppliers understand the work. Then set the transit classification: Domestic if it stays "
     "inside Tanzania, Cross-Border if it crosses an international line — that tells us to prepare the right border "
     "paperwork. Finally, enter your origin and destination. You can add a clear job title, or leave it blank and "
     "we'll generate one for you."),
    ("post-submit", "CLIENT", "Step 1 — Open for bids",
     "Post and open for bids",
     "On the right, the panel reminds you exactly how this works: suppliers bid a quantity and a price per unit; "
     "we automatically fill the cheapest bids until your quantity is met; then we set one flat, fair price that "
     "every awarded supplier agrees to — so nobody is overcharged and nobody is shortchanged. When you're happy, "
     "press Post job and open for bids. That's it — your demand is now live, and qualified suppliers across our "
     "corridors can start competing for it. Let's open the job we just created and see what happens next."),
    ("bids-award", "CLIENT", "Step 2 — Review bids",
     "Bids and award",
     "Here is the job detail page. As suppliers respond, their bids appear in this table — each row showing the "
     "supplier, how many units they're offering, and their price per unit. You don't have to study a spreadsheet "
     "or haggle. When you're ready, you press Confirm award, and the system does the fair thing automatically: it "
     "accepts the cheapest bids until your quantity is filled, then sets that one flat fair price for everyone. "
     "Behind the scenes it creates a separate signed agreement for each awarded supplier, so every party is bound "
     "to their own share. Watch the tracker advance the moment you confirm."),
    ("awarded", "CLIENT", "Step 3 — Awarded suppliers",
     "Your awarded suppliers",
     "Now you can see exactly who is delivering your job. Each awarded supplier is listed with the number of units "
     "they're providing and their total value, along with the stage their individual contract has reached. From "
     "this point, the suppliers sign their agreements and upload their fleet documents, and then our field inspector "
     "physically verifies every machine. You don't have to chase any of this — the platform drives each party "
     "through their step, and your tracker keeps you informed. Your next action only comes once inspection passes."),
    ("permits", "CLIENT", "Step 4 — Upload permits",
     "Your permits step",
     "Once the field inspection clears, the job pauses and waits for you. This is your step. The system asks you to "
     "upload the transit permits for the route — the clearances that legally allow the load to move. Press to upload "
     "your permit document, and once it's attached, submit it for verification. Our team checks the paperwork and, "
     "on confirmation, shares it with your suppliers. This human review is deliberate — at this stage of the company "
     "we'd rather a person confirm every permit than trust a machine to do it. It's a little slower, and far safer."),
    ("payment", "CLIENT", "Step 5 — Payment & escrow",
     "Funding the escrow",
     "After your permits are verified, you reach the moment that makes Nguzo trustworthy: payment. You upload your "
     "T.T. payment proof — the bank transfer confirmation — and this is what funds the escrow. Look at the escrow "
     "preview here: it shows the exact amount, clearly labelled funds tracked, not held loosely. Your money sits "
     "secured with Nguzo. It is not handed to any supplier yet. It is only released to them, less our transparent "
     "seven percent service fee, once the job is verified complete. That is the whole promise — your money is safe "
     "until you have what you paid for."),
    ("track", "CLIENT", "Step 6 — Track & message",
     "Stay in the loop",
     "While your job runs, this page keeps everything in one place. The Status panel tells you in plain language "
     "exactly where things stand. The Messages thread lets you talk directly to the people on your job — no phone "
     "tag, no lost WhatsApp threads, every word on the record. And the Activity timeline logs every single event as "
     "it happens, stamped with the time, so there is a permanent, honest history of your job from the first bid to "
     "the final handover. Every document either side uploads is listed too, ready to open whenever you want."),
    ("close", "CLIENT", "You're in control",
     "From posting to completion",
     "And that is the whole journey from your side: post what you need, let suppliers compete fairly, confirm the "
     "award, upload your permits, fund the secured escrow, and watch the job move to completion — with a real "
     "inspector protecting your money at the gate and a full record of every step. You never chase a supplier, you "
     "never wonder where your money went, and you never carry the risk alone. That is what Nguzo Africa was built to "
     "give you. Welcome aboard — let's move something."),
]

SUPPLIER = [
    ("intro", "SUPPLIER", "Your supplier dashboard",
     "Where your work lives",
     "Welcome to Nguzo Africa. If you own trucks or machinery, this is the dashboard that turns your idle assets "
     "into paid work — fairly, and with your money protected. Start on the Jobs page. These four counters at the top "
     "are your pulse: Open to bid shows live jobs you can compete for right now, My awards is the work you've already "
     "won, Executing is what's moving on the ground today, and Bids placed is how many offers you currently have on "
     "the table. Over on the left you have four places to work — Jobs, Fleet, Escrow Vault, and Report Breakdown. "
     "We'll walk through every one of them."),
    ("open-tenders", "SUPPLIER", "Step 1 — Open Tenders",
     "Find jobs to bid on",
     "Under your counters sits the Open Tenders list — every job a client has posted that matches what you can carry "
     "or operate. Each row tells you the essentials at a glance: what's needed, how many units, the route, and "
     "whether it's a domestic move or a cross-border one. Nothing here is hidden and nothing is first-come-first-served. "
     "You read the job, decide if it fits your fleet, and click in to make your offer. Take your time — a good bid "
     "starts with reading the job properly."),
    ("place-bid", "SUPPLIER", "Step 2 — Place a bid",
     "Offer your price and quantity",
     "This is the heart of your work: placing a bid. Open a job and you'll see the Place your bid card. Two things "
     "to set — how many units you can supply, and your price per unit. Here's what makes Nguzo fair: you can bid for "
     "the full quantity or just part of it. If a client needs five trucks and you only have two, bid for two. "
     "Our system auto-fills the cheapest bids until the quantity is met, then settles everyone onto a single flat "
     "fair price. So you compete on honest pricing, not on who refreshed the page first. Submit your bid, and you "
     "can update it any time before the award."),
    ("my-awards", "SUPPLIER", "Step 3 — My Awards",
     "The work you've won",
     "When a client confirms the award, your job moves into My Awards. Open it and the first thing you'll notice is "
     "the stage tracker — this is your map for the whole job, showing every step from the signed agreement right "
     "through to execution, and exactly where you are now. Below it you'll see your award in plain numbers: the units "
     "you've been given and the flat fair price per unit, with your total. There are no surprises and no hidden "
     "deductions — what you see is what you're contracted for."),
    ("agreement", "SUPPLIER", "Step 4 — Sign the agreement",
     "Download, sign, re-upload",
     "Your first action on a won job is the agreement. Download the contract of agreement we generate for your share "
     "of the work, read it, sign it, and upload the signed copy back here. For now this is a deliberate manual step — "
     "you physically sign and re-upload, so there's a real, accountable paper trail behind every job. Once your signed "
     "agreement is attached, press Confirm agreement signed and the job advances to the next gate. Nothing moves until "
     "this is done — that protects you as much as the client."),
    ("fleet-docs", "SUPPLIER", "Step 5 — Upload fleet documents",
     "Prove the asset is real",
     "Next gate: your machine and fleet documents. Upload your registration, inspection certificates, and insurance "
     "for the asset you're putting on this job. This is what our field inspector will check against the real machine "
     "on the ground, so it has to match. Attach the documents and submit them for inspection. This step is exactly "
     "why a client trusts Nguzo over a faceless marketplace — every asset is verified by a real person before a "
     "shilling moves. Get it uploaded and the job heads to field verification."),
    ("fleet", "SUPPLIER", "Step 6 — Fleet Configuration",
     "Your assets on file",
     "Now let's leave the job and look after your business. The Fleet page is where you list every heavy asset you "
     "own — and keeping it current means you bid faster and look more credible to clients. The counters show your "
     "totals: how many assets you have, how many are available, how many are active on jobs, and any in breakdown. "
     "Each asset card carries its engine serial, day rate, and yard location — the details that make it a verified, "
     "trackable machine and not just a line in a spreadsheet."),
    ("add-asset", "SUPPLIER", "Step 6 — Add an asset",
     "Register a new machine",
     "To add a machine, open Add Asset. You'll pick the type — excavator, prime mover, tipper, and so on — then enter "
     "the manufacturer and model, your day rate in shillings, and crucially the engine serial and the V.I.N. or "
     "chassis number. Those two numbers are the machine's fingerprint; they're what the field inspector matches "
     "on-site. Finally, set the yard location where it's based. Save the asset and it's instantly available to put "
     "against new jobs. Keep this list honest and complete — it's your shop window."),
    ("vault", "SUPPLIER", "Step 7 — Escrow Vault",
     "See your money before it lands",
     "Here's the part suppliers love most: the Escrow Vault. For every job you win, the client's payment is locked in "
     "escrow before the wheels even turn — so the money is already secured by Nguzo before you commit your asset. "
     "This table shows, per contract, exactly what's locked, any emergency parts credit drawn against it, and your "
     "clean net payout once the job is signed off. You're never chasing an invoice and never wondering if you'll be "
     "paid. You can see the money waiting for you from day one."),
    ("breakdown", "SUPPLIER", "Step 8 — Report Breakdown",
     "Help when an asset is stranded",
     "Finally, Report Breakdown — your safety net when a machine goes down mid-job. Select the affected active "
     "contract and the spare part you need from the catalog. The moment you do, Nguzo checks whether the locked "
     "escrow on that job covers the part and its delivery. If it does, dispatch is auto-approved from the nearest "
     "Dar wholesale supplier and sent up-country by express courier — drawn against the escrow, not your pocket. "
     "A breakdown that used to cost you days now costs you minutes."),
    ("close", "SUPPLIER", "You're set up to win work",
     "From bid to payout",
     "And that's your whole world as a Nguzo supplier: find the right jobs, bid an honest price, win the work, sign "
     "and verify, then watch your secured payout sit waiting in the vault — with a real safety net if a machine ever "
     "falters. You compete fairly, you're paid reliably, and you're never left stranded. Keep your fleet current, "
     "bid with confidence, and let Nguzo handle the trust. Welcome to the network — let's get your assets earning."),
]

SCRIPTS = {"field": FIELD, "client": CLIENT, "supplier": SUPPLIER}

def build(role):
    segs = SCRIPTS[role]
    d = f"{VO}/{role}"; os.makedirs(d, exist_ok=True)
    meta = []
    for sid, phase, step, title, text in segs:
        out = f"{d}/{sid}.mp3"
        subprocess.run(["say", "-v", VOICE, text, "-o", out], check=True)
        dur = float(subprocess.check_output(
            ["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",out]).strip())
        meta.append({"id": sid, "phase": phase, "step": step, "title": title,
                     "mp3": out, "dur": round(dur, 2)})
        print(f"  {role}/{sid}: {dur:.1f}s")
    with open(f"{d}/_durs.json", "w") as f:
        json.dump(meta, f, indent=2)
    total = sum(m["dur"] for m in meta)
    print(f"{role} total VO: {total:.1f}s  (~{total/60:.1f} min before cards)")

if __name__ == "__main__":
    role = sys.argv[1] if len(sys.argv) > 1 else "field"
    build(role)
