"""Overview clip VO script — Nguzo Africa. ~2 min investor/overview pitch."""
import os, subprocess

VO = "/home/user/afrigen/tutorials/vo"
os.makedirs(VO, exist_ok=True)
VOICE = "george"

# (id, caption, narration)
SEGMENTS = [
    ("01", "NGUZO AFRICA",
     "Across East Africa, moving heavy machinery and cargo runs on trust. "
     "And trust is exactly what's missing."),
    ("02", "The trust problem",
     "Clients risk paying for equipment that never arrives. Fleet and machinery owners "
     "risk doing the work and never getting paid. Brokers add cost but carry no accountability."),
    ("03", "One coordinated layer",
     "Nguzo Africa sits in the middle as the trusted pillar. We coordinate every deal, "
     "secure the money, and put real people on the ground."),
    ("04", "Post a job",
     "A client posts a job. They choose a cargo carrier or machinery type, describe the work, "
     "and specify how many units they need."),
    ("05", "Suppliers bid",
     "Verified suppliers bid for part or all of that quantity, each with their own price."),
    ("06", "Auto-fill award",
     "Nguzo automatically fills the order with the most competitive bids until the quantity is met, "
     "then settles everyone on one fair, agreed price."),
    ("07", "Secured by escrow",
     "Project funds are tracked in escrow before any wheels turn. Owners know the money is real. "
     "Clients know it's protected until the job is done right."),
    ("08", "Boots on the ground",
     "Our field agents inspect machinery and verify documents in person. "
     "Border liaison agents clear the corridors when portals fail."),
    ("09", "A staged gate",
     "Every job moves through a strict, staged gate. Agreements, documents, inspection, permits, "
     "payment proof — each step is verified before the next can begin."),
    ("10", "Three corridors",
     "We operate across Tanzania and the Southern, Central, and Northern corridors — "
     "from Dar es Salaam to the borders and beyond."),
    ("11", "Split settlement",
     "On sign-off, settlement is automatic. The supplier is paid, our flat service fee is taken, "
     "and both sides get a clear, itemized record."),
    ("12", "The pillar behind every deal",
     "Nguzo Africa. Cargo and machinery coordination — secured."),
]

if __name__ == "__main__":
    for sid, cap, text in SEGMENTS:
        out = f"{VO}/seg{sid}.mp3"
        subprocess.run(["say", "-v", VOICE, text, "-o", out], check=True)
        d = subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",out]).strip()
        print(f"seg{sid}: {float(d):.1f}s  '{cap}'")
    print("VO DONE")
