#!/usr/bin/env python3
"""Build the Nguzo Africa Platform Operating Guide PDF (branded, screenshot-driven)."""
import base64, os
from pathlib import Path
from playwright.sync_api import sync_playwright

SHOTS = "/home/user/afrigen/shots/qa"
LOGO = "/home/user/afrigen/packages/web/public/logo.png"
OUT = "/home/user/afrigen/tutorials/Nguzo-Platform-Guide.pdf"
CHROME = "/home/user/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome"

def b64(p):
    return base64.b64encode(Path(p).read_bytes()).decode()

def img(name):
    return f"data:image/png;base64,{b64(os.path.join(SHOTS, name + '.png'))}"

LOGO_URI = f"data:image/png;base64,{b64(LOGO)}"

# stage table rows
STAGES = [
    ("1", "Bidding open", "Supplier", "Client posts a job (quantity + type + cargo/project). Suppliers bid partial or full quantity at their price."),
    ("2", "Award confirmed", "Client", "System auto-fills the cheapest bids until the quantity is met, sets one flat fair price, client confirms. One contract per awarded supplier."),
    ("3", "Agreements signed", "Supplier", "Each awarded supplier downloads their contract of agreement, signs it, and re-uploads the signed copy."),
    ("4", "Machine docs uploaded", "Supplier", "Supplier uploads fleet / machine documents — registration, inspection certificates, insurance."),
    ("5", "Field verified", "Field agent", "Nguzo field agent reviews documents and inspects the assets on the ground, then verifies."),
    ("6", "Permits uploaded", "Client", "Client uploads the required transport / project permits for the route."),
    ("7", "Permits verified", "Nguzo admin", "Admin checks the uploaded permits are valid and releases the next step."),
    ("8", "Payment proof uploaded", "Client", "Client uploads the TT payment proof. This is the escrow funding step — funds are recorded as held by Nguzo."),
    ("9", "Escrow confirmed", "Nguzo admin", "Admin confirms the payment is received. Escrow is recorded as held by Nguzo."),
    ("10", "Approved — executing", "Nguzo admin", "Admin gives the final authorisation. Supplier and field force begin execution."),
]

def stage_rows():
    out = ""
    for n, label, who, desc in STAGES:
        out += f"""<tr>
          <td class="num">{n}</td>
          <td class="stg">{label}</td>
          <td class="who">{who}</td>
          <td class="desc">{desc}</td></tr>"""
    return out

def role_section(title, subtitle, intro, steps, shots):
    step_html = "".join(f"<li><span class='sn'>{i+1}</span><div>{s}</div></li>" for i, s in enumerate(steps))
    shot_html = "".join(f"<figure><img src='{img(s)}'/><figcaption>{cap}</figcaption></figure>" for s, cap in shots)
    return f"""
    <section class="role">
      <div class="role-head">
        <div class="role-tag">{subtitle}</div>
        <h2>{title}</h2>
        <p class="role-intro">{intro}</p>
      </div>
      <ol class="steps">{step_html}</ol>
      <div class="shots">{shot_html}</div>
    </section>"""

BODY = f"""
<!-- COVER -->
<section class="cover">
  <img class="logo" src="{LOGO_URI}"/>
  <div class="cover-mid">
    <div class="kicker">PROCUREMENT PLATFORM</div>
    <h1>Operating Guide</h1>
    <p class="cov-sub">How cargo transport and machinery rental move through Nguzo Africa — from posting a job to execution, secured at every step.</p>
  </div>
  <div class="cover-foot">
    <span>Nguzo Africa Ltd</span>
    <span>Cargo &amp; Machinery Coordination — Secured.</span>
  </div>
</section>

<!-- OVERVIEW -->
<section class="content">
  <div class="eyebrow">THE BIG PICTURE</div>
  <h2 class="pageh">One job. Ten gated steps. No shortcuts.</h2>
  <p class="lead">Every job on Nguzo moves through a strict, ordered gate. Each step must be completed before the next unlocks — so a deal can never skip verification, permits, or payment. This is the trust layer made literal.</p>

  <table class="stages">
    <thead><tr><th>#</th><th>Stage</th><th>Who acts</th><th>What happens</th></tr></thead>
    <tbody>{stage_rows()}</tbody>
  </table>

  <div class="callout">
    <strong>Why the gate matters.</strong> Most marketplaces are passive — they match and step away. Nguzo holds the deal together: collateralized escrow, boots-on-the-ground inspection, and a strict approval order mean no party is exposed. Funds are tracked and held by Nguzo until execution is authorised.
  </div>
</section>

{role_section(
  "For Clients", "POST · AWARD · PAY",
  "You need trucks or machinery. You post what you need, watch verified suppliers bid, confirm the award, and fund the job through escrow — all in one place.",
  [
    "From <b>My Jobs</b>, click <b>Post a Job</b>. Choose cargo transport or machinery rental, pick the exact type, describe the cargo or project, and set how many units you need.",
    "Suppliers bid partial or full quantity. You watch bids land in real time on the job page.",
    "Click <b>Confirm award</b>. Nguzo auto-fills the cheapest bids to your quantity and sets one flat fair price — every awarded supplier settles at the same rate.",
    "Once suppliers sign and pass field inspection, you upload your <b>permits</b>, then your <b>TT payment proof</b>. Your payment is held in escrow by Nguzo until execution is approved.",
  ],
  [("10-client-job-bidding","Posting a job and opening bidding"),
   ("13-client-awarded","Award confirmed — flat fair price, escrow tracked"),
   ("16-client-tt","Uploading payment proof to fund escrow")]
)}

{role_section(
  "For Suppliers", "BID · SIGN · SUPPLY",
  "You own trucks or machinery. You find open jobs, bid the quantity you can supply, sign your agreement, and prove your fleet — with guaranteed payment waiting in escrow.",
  [
    "On the <b>Jobs</b> board, open any tender in <b>Bidding</b>. Enter the units you can supply and your price per unit, then submit your bid.",
    "If awarded, go to <b>My Awards</b>. Download your contract of agreement, sign it, and upload the signed copy.",
    "Upload your <b>machine / fleet documents</b> — registration, inspection certificates, insurance — for the Nguzo field agent to verify.",
    "Once you're verified, your part is done. The job moves through permits and payment, and you're paid from escrow on execution.",
  ],
  [("11-supplier-bid","Placing a bid — units and price per unit"),
   ("14-supplier-award-docs","Awarded: download, sign and upload agreement + docs")]
)}

{role_section(
  "For Field Agents", "INSPECT · VERIFY",
  "You are Nguzo's eyes on the ground. You review supplier documents and physically inspect the assets before any job is allowed to proceed.",
  [
    "Open <b>Inspections</b> to see jobs waiting for verification once suppliers have uploaded their fleet documents.",
    "Open a job to review the uploaded machine / fleet documents against the assets.",
    "Inspect on site, then <b>verify</b>. This unlocks the permit stage — no job advances without your sign-off.",
  ],
  [("20-field-inspections","Inspection queue — jobs awaiting verification"),
   ("21-field-inspect","Reviewing documents and verifying on the ground")]
)}

{role_section(
  "For Nguzo Admin", "VERIFY · CONFIRM · APPROVE",
  "You hold the final gates. You verify permits, confirm escrow funding, and give the authorisation that lets a job execute.",
  [
    "From <b>Jobs</b>, open a tender at the permit stage. Review the client's uploaded permits and <b>verify</b> them.",
    "When the client uploads TT proof, <b>confirm payment received</b>. Escrow is recorded as held by Nguzo.",
    "Give the final <b>Approve to execute</b>. The supplier and field force are authorised to begin. Track every action in the activity log.",
  ],
  [("30-admin-jobs","Admin jobs pipeline across all clients"),
   ("31-admin-verify-permits","Verifying permits and releasing the next step"),
   ("33-admin-executing","Escrow confirmed, job approved and executing")]
)}

<!-- INVESTOR READ -->
<section class="content investor">
  <div class="eyebrow">THE INVESTOR READ</div>
  <h2 class="pageh">The gate is the moat.</h2>
  <p class="lead">Africa doesn't have a payment problem — it has a trust problem. Passive marketplaces failed because matching alone doesn't make strangers transact on high-value, cross-border deals. Nguzo's defensibility is in three things competitors can't copy by writing code:</p>
  <div class="moats">
    <div class="moat"><div class="mn">01</div><h3>Collateralized escrow</h3><p>Project capital is locked and tracked by Nguzo, then auto-split on sign-off. Suppliers know payment is secured before they move an asset.</p></div>
    <div class="moat"><div class="mn">02</div><h3>Boots on the ground</h3><p>Field inspectors physically verify assets and border liaison agents resolve corridor stalls. A passive app cannot stand at Tunduma.</p></div>
    <div class="moat"><div class="mn">03</div><h3>A strict, un-skippable gate</h3><p>Ten ordered steps mean no deal proceeds without verification, permits, and confirmed funds. Risk is structurally removed, not promised.</p></div>
  </div>
  <div class="callout dark">
    <strong>What you just saw is live.</strong> Every screenshot in this guide is the working platform — a real job posted, bid, awarded at a flat fair price, inspected, permitted, funded into escrow, and approved to execute. The flywheel runs today.
  </div>
</section>
"""

HTML = f"""<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=Manrope:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap" rel="stylesheet">
<style>
  @page {{ size: A4; margin: 0; }}
  * {{ box-sizing: border-box; margin:0; padding:0; }}
  body {{ font-family:'Manrope',sans-serif; color:#1d2433; font-size:10.5pt; line-height:1.7; }}
  .navy {{ color:#141B2E; }}
  /* COVER */
  .cover {{ height:297mm; background:#141B2E; color:#F7F6F3; padding:26mm 22mm; display:flex; flex-direction:column; justify-content:space-between; page-break-after:always; position:relative; overflow:hidden; }}
  .cover::after {{ content:""; position:absolute; right:-120mm; bottom:-120mm; width:260mm; height:260mm; border-radius:50%; background:radial-gradient(circle, rgba(217,154,43,0.18), transparent 60%); }}
  .cover .logo {{ width:150px; height:150px; border-radius:16px; }}
  .cover-mid {{ position:relative; z-index:2; }}
  .kicker {{ font-family:'IBM Plex Mono',monospace; letter-spacing:.32em; font-size:10pt; color:#D99A2B; margin-bottom:14px; }}
  .cover h1 {{ font-family:'Sora',sans-serif; font-weight:800; font-size:54pt; line-height:1.02; letter-spacing:-1.5px; }}
  .cov-sub {{ margin-top:18px; max-width:140mm; font-size:13pt; line-height:1.6; color:#cfd6e4; }}
  .cover-foot {{ display:flex; justify-content:space-between; font-family:'IBM Plex Mono',monospace; font-size:9pt; color:#8b95ab; letter-spacing:.04em; position:relative; z-index:2; }}
  /* CONTENT PAGES */
  .content, .role {{ padding:14mm 20mm; }}
  .role {{ page-break-before:always; }}
  .content.investor {{ page-break-before:always; }}
  .eyebrow, .role-tag {{ font-family:'IBM Plex Mono',monospace; letter-spacing:.26em; font-size:8.5pt; color:#D99A2B; font-weight:600; margin-bottom:8px; }}
  .pageh, .role h2 {{ font-family:'Sora',sans-serif; font-weight:800; font-size:23pt; color:#141B2E; letter-spacing:-.6px; line-height:1.1; margin-bottom:8px; }}
  table.stages thead th {{ padding:7px 10px; }}
  .callout {{ margin-top:14px; }}
  .lead, .role-intro {{ font-size:11pt; color:#46506a; max-width:160mm; margin-bottom:12px; }}
  /* stage table */
  table.stages {{ width:100%; border-collapse:collapse; margin-top:8px; font-size:9.5pt; }}
  table.stages thead th {{ background:#141B2E; color:#F7F6F3; text-align:left; padding:9px 10px; font-family:'IBM Plex Mono',monospace; font-size:8pt; letter-spacing:.1em; text-transform:uppercase; }}
  table.stages td {{ padding:6px 10px; border-bottom:1px solid #e7e3da; vertical-align:top; }}
  td.num {{ font-family:'Sora',sans-serif; font-weight:800; color:#D99A2B; width:24px; }}
  td.stg {{ font-weight:700; color:#141B2E; width:46mm; }}
  td.who {{ color:#7a839a; width:30mm; font-family:'IBM Plex Mono',monospace; font-size:8.5pt; }}
  td.desc {{ color:#46506a; }}
  tr:nth-child(even) td {{ background:#faf9f6; }}
  .callout {{ margin-top:18px; padding:14px 18px; background:#fbf3e2; border-left:4px solid #D99A2B; border-radius:0 8px 8px 0; font-size:10pt; color:#5a4a25; }}
  .callout.dark {{ background:#141B2E; color:#d9deea; border-left-color:#D99A2B; }}
  .callout strong {{ color:#141B2E; }}
  .callout.dark strong {{ color:#D99A2B; }}
  /* role steps */
  .role-head {{ margin-bottom:14px; }}
  ol.steps {{ list-style:none; margin:0 0 16px; }}
  ol.steps li {{ display:flex; gap:12px; margin-bottom:11px; align-items:flex-start; }}
  .sn {{ flex:none; width:24px; height:24px; border-radius:50%; background:#141B2E; color:#D99A2B; font-family:'Sora',sans-serif; font-weight:700; font-size:10pt; display:flex; align-items:center; justify-content:center; }}
  ol.steps li div {{ font-size:10.5pt; color:#39425a; padding-top:1px; }}
  .shots {{ display:flex; flex-direction:column; gap:12px; }}
  figure {{ border:1px solid #e2ddd2; border-radius:10px; overflow:hidden; background:#0d1422; page-break-inside:avoid; }}
  figure img {{ width:100%; display:block; }}
  figcaption {{ font-family:'IBM Plex Mono',monospace; font-size:8pt; color:#7a839a; padding:7px 12px; background:#fff; border-top:1px solid #eee; letter-spacing:.02em; }}
  /* investor */
  .moats {{ display:flex; gap:14px; margin:18px 0; }}
  .moat {{ flex:1; border:1px solid #e7e3da; border-radius:12px; padding:16px; background:#faf9f6; }}
  .mn {{ font-family:'IBM Plex Mono',monospace; color:#D99A2B; font-weight:600; font-size:9pt; margin-bottom:8px; }}
  .moat h3 {{ font-family:'Sora',sans-serif; font-size:13pt; color:#141B2E; margin-bottom:6px; }}
  .moat p {{ font-size:9.5pt; color:#46506a; }}
  .moats {{ page-break-inside:avoid; }}
  ol.steps li {{ page-break-inside:avoid; }}
</style></head><body>{BODY}</body></html>"""

html_path = "/home/user/afrigen/tutorials/_guide.html"
Path(html_path).write_text(HTML, encoding="utf-8")

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
    pg = b.new_page()
    pg.goto("file://" + html_path, wait_until="networkidle")
    pg.wait_for_timeout(1500)
    pg.pdf(path=OUT, prefer_css_page_size=True, print_background=True)
    b.close()
print("PDF written:", OUT)
