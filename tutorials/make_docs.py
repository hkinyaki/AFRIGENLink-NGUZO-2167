"""Realistic branded sample PDFs for the walkthrough uploads (HTML -> Chrome PDF)."""
import os, subprocess, base64

OUT = "/home/user/afrigen/tutorials/docs"
os.makedirs(OUT, exist_ok=True)
CHROME = "/usr/bin/google-chrome-stable"
LOGO = "/home/user/afrigen/packages/web/public/logo.png"

logo_b64 = base64.b64encode(open(LOGO,"rb").read()).decode()

CSS = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@500;700&family=Manrope:wght@400;600&family=IBM+Plex+Mono:wght@500&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Manrope',sans-serif;color:#1c2438;background:#fff}
.bar{height:10px;background:#D99A2B}
.head{display:flex;align-items:center;gap:16px;padding:28px 44px 18px;border-bottom:2px solid #eef0f4}
.head img{width:54px;height:54px;border-radius:10px}
.brand{font-family:'Sora';font-weight:700;font-size:22px;color:#141B2E;letter-spacing:.5px}
.brand small{display:block;font-family:'IBM Plex Mono';font-size:10px;color:#D99A2B;letter-spacing:2px;margin-top:3px}
.docref{margin-left:auto;text-align:right;font-family:'IBM Plex Mono';font-size:11px;color:#64748b}
.title{font-family:'Sora';font-weight:700;font-size:26px;color:#141B2E;padding:30px 44px 6px}
.sub{padding:0 44px 22px;color:#64748b;font-size:13px}
.body{padding:6px 44px}
.row{display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px solid #f0f2f6;font-size:13.5px}
.row .k{color:#64748b}.row .v{color:#141B2E;font-weight:600}
.para{font-size:13px;line-height:1.7;color:#33405a;margin:16px 0}
.sign{display:flex;gap:60px;margin-top:48px;padding-top:10px}
.sign .b{flex:1}
.sline{border-top:1.5px solid #141B2E;margin-top:46px;padding-top:6px;font-size:11px;color:#64748b}
.stamp{position:relative;margin-top:30px;display:inline-block;border:2.5px solid #157a4d;color:#157a4d;border-radius:8px;padding:8px 16px;font-family:'Sora';font-weight:700;font-size:14px;transform:rotate(-6deg);opacity:.85}
.foot{position:fixed;bottom:0;left:0;right:0;padding:14px 44px;border-top:2px solid #eef0f4;font-family:'IBM Plex Mono';font-size:10px;color:#94a3b8;display:flex;justify-content:space-between}
</style>
"""

def page(title, sub, ref, inner):
    return f"""<!doctype html><html><head><meta charset=utf-8>{CSS}</head><body>
<div class=bar></div>
<div class=head>
  <img src="data:image/png;base64,{logo_b64}">
  <div class=brand>NGUZO AFRICA<small>CARGO & MACHINERY COORDINATION — SECURED</small></div>
  <div class=docref>{ref}</div>
</div>
<div class=title>{title}</div>
<div class=sub>{sub}</div>
<div class=body>{inner}</div>
<div class=foot><span>Nguzo Africa Ltd · Dar es Salaam, Tanzania</span><span>nguzo.africa · Generated via Nguzo Platform</span></div>
</body></html>"""

DOCS = {
"Signed-Transport-Agreement-Nguzo": page(
  "Transport Service Agreement","Contract of Agreement — one per awarded supplier","REF: AGR-2026-0418 · TENDER NG-7741",
  """
  <div class=row><span class=k>Client</span><span class=v>Geita Construction & Mining Ltd</span></div>
  <div class=row><span class=k>Supplier</span><span class=v>Kilimo Haulage Co. Ltd</span></div>
  <div class=row><span class=k>Scope</span><span class=v>Tipper Truck · 2 units awarded</span></div>
  <div class=row><span class=k>Route</span><span class=v>Dar es Salaam → Geita (Central Corridor)</span></div>
  <div class=row><span class=k>Flat fair price</span><span class=v>TZS 513,333 / unit</span></div>
  <div class=para>This Agreement governs the engagement coordinated by Nguzo Africa Ltd between the Client and Supplier above. Funds are secured in escrow by Nguzo prior to mobilisation and released on verified completion, net of the 7% Nguzo service fee. The Supplier warrants that all vehicles and operators meet the documentation and inspection standards verified by Nguzo Ground Force.</div>
  <div class=sign><div class=b><div class=sline>Supplier — authorised signatory</div></div><div class=b><div class=sline>Nguzo Africa — coordinator</div></div></div>
  <div class=stamp>SIGNED &amp; RETURNED</div>
  """),
"Vehicle-Registration-Inspection-Certificate": page(
  "Vehicle Registration & Fitness","Machinery / fleet documentation submitted by supplier","REF: VEH-T315-ABC · TENDER NG-7741",
  """
  <div class=row><span class=k>Asset</span><span class=v>Tipper Truck — FAW J6 8x4</span></div>
  <div class=row><span class=k>Registration</span><span class=v>T 315 ABC</span></div>
  <div class=row><span class=k>Year / Capacity</span><span class=v>2023 · 30 tonnes</span></div>
  <div class=row><span class=k>Inspection (TBS)</span><span class=v>Valid to 12 Mar 2027</span></div>
  <div class=row><span class=k>Insurance</span><span class=v>Comprehensive — Active</span></div>
  <div class=para>Submitted for Nguzo Ground Force on-site verification. Mechanical fitness, load rating and operator licensing confirmed against the awarded scope.</div>
  <div class=stamp>VERIFIED ON SITE</div>
  """),
"TARURA-Transit-Permit": page(
  "Heavy-Load Transit Permit","Permits uploaded by client for route clearance","REF: TARURA/HL/2026/2218 · TENDER NG-7741",
  """
  <div class=row><span class=k>Permit type</span><span class=v>Heavy-Load Road Transit</span></div>
  <div class=row><span class=k>Authority</span><span class=v>TARURA</span></div>
  <div class=row><span class=k>Corridor</span><span class=v>Central — Dar es Salaam → Geita</span></div>
  <div class=row><span class=k>Gross load</span><span class=v>Within approved axle limits</span></div>
  <div class=row><span class=k>Valid</span><span class=v>18 Apr 2026 → 18 May 2026</span></div>
  <div class=para>Issued for the movement coordinated under Tender NG-7741. Subject to municipal and TARURA heavy-load conditions. Verified by Nguzo administration before execution.</div>
  <div class=stamp>APPROVED</div>
  """),
"TT-Payment-SWIFT-Confirmation": page(
  "TT Payment Confirmation","Telegraphic transfer proof — funds the Nguzo escrow","REF: SWIFT MT103 · TENDER NG-7741",
  """
  <div class=row><span class=k>Remitter</span><span class=v>Geita Construction & Mining Ltd</span></div>
  <div class=row><span class=k>Beneficiary</span><span class=v>Nguzo Africa Ltd — Escrow</span></div>
  <div class=row><span class=k>Amount</span><span class=v>TZS 1,540,000 (project capital)</span></div>
  <div class=row><span class=k>Reference</span><span class=v>NG-7741 / ESCROW</span></div>
  <div class=row><span class=k>Status</span><span class=v>Sent — awaiting Nguzo confirmation</span></div>
  <div class=para>This telegraphic transfer funds the escrow held by Nguzo Africa for the awarded suppliers. Funds are tracked and held until the admin confirms execution, then split-settled net of the 7% service fee.</div>
  <div class=stamp>FUNDS SENT</div>
  """),
}

if __name__ == "__main__":
    for name, html in DOCS.items():
        hp = f"{OUT}/{name}.html"; open(hp,"w").write(html)
        pdf = f"{OUT}/{name}.pdf"
        subprocess.run([CHROME,"--headless","--no-sandbox","--disable-gpu",
            "--no-pdf-header-footer",f"--print-to-pdf={pdf}", f"file://{hp}"],
            capture_output=True)
        os.remove(hp)
        print("pdf", name, os.path.getsize(pdf),"bytes")
    print("DOCS DONE")
