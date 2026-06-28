"""Build title card + caption lower-third overlays (1920x1080 transparent PNGs)."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

ROOT = "/home/user/afrigen"
OV = f"{ROOT}/overlays"
os.makedirs(OV, exist_ok=True)

NAVY = (15, 26, 46)
NAVY_DEEP = (10, 17, 31)
AMBER = (245, 166, 35)
SLATE = (148, 163, 184)
WHITE = (237, 242, 247)

GRO = f"{ROOT}/fonts/SpaceGrotesk.ttf"
INT = f"{ROOT}/fonts/Inter.ttf"

def F(path, size):
    return ImageFont.truetype(path, size)

W, H = 1920, 1080

# ---------- TITLE CARD ----------
def title_card():
    img = Image.new("RGB", (W, H), NAVY_DEEP)
    d = ImageDraw.Draw(img)
    # subtle grid
    for x in range(0, W, 80):
        d.line([(x,0),(x,H)], fill=(18,30,52), width=1)
    for y in range(0, H, 80):
        d.line([(0,y),(W,y)], fill=(18,30,52), width=1)
    # amber accent bar
    d.rectangle([0, H//2-150, 14, H//2+150], fill=AMBER)
    # logo wordmark
    fbig = F(GRO, 150)
    txt = "AFRIGEN"
    bb = d.textbbox((0,0), txt, font=fbig)
    tw = bb[2]-bb[0]
    x0 = (W-tw)//2
    d.text((x0, H//2-160), "AFRI", font=fbig, fill=WHITE)
    bb2 = d.textbbox((0,0), "AFRI", font=fbig)
    d.text((x0+(bb2[2]-bb2[0]), H//2-160), "GEN", font=fbig, fill=AMBER)
    # tagline
    fsub = F(INT, 38)
    sub = "Operating Infrastructure for Heavy Machinery & Cross-Border Logistics"
    bb = d.textbbox((0,0), sub, font=fsub)
    d.text(((W-(bb[2]-bb[0]))//2, H//2+40), sub, font=fsub, fill=SLATE)
    # region line
    fr = F(INT, 26)
    reg = "EAST  AFRICA"
    bb = d.textbbox((0,0), reg, font=fr)
    d.text(((W-(bb[2]-bb[0]))//2, H//2+120), reg, font=fr, fill=AMBER)
    img.save(f"{OV}/title.png")
    print("title.png")

# ---------- LOWER-THIRD CAPTION ----------
def caption(name, kicker, headline, sub=""):
    img = Image.new("RGBA", (W, H), (0,0,0,0))
    d = ImageDraw.Draw(img)
    # gradient scrim bottom
    scrim = Image.new("RGBA",(W,420),(0,0,0,0))
    sd = ImageDraw.Draw(scrim)
    for i in range(420):
        a = int(215 * (i/420)**1.5)
        sd.line([(0,i),(W,i)], fill=(8,14,26,a))
    img.alpha_composite(scrim,(0,H-420))
    # amber tick
    bx = 90
    by = H-235
    d.rectangle([bx, by, bx+10, by+150], fill=AMBER)
    # kicker
    fk = F(GRO, 30)
    d.text((bx+34, by-4), kicker.upper(), font=fk, fill=AMBER)
    # headline (wrap to <= ~38 chars/line)
    fh = F(GRO, 64)
    words = headline.split()
    lines, cur = [], ""
    for w in words:
        t = (cur+" "+w).strip()
        if d.textlength(t, font=fh) > 1500:
            lines.append(cur); cur = w
        else:
            cur = t
    lines.append(cur)
    yy = by+44
    for ln in lines:
        d.text((bx+34, yy), ln, font=fh, fill=WHITE)
        yy += 76
    # sub line
    if sub:
        fs = F(INT, 32)
        d.text((bx+36, yy+6), sub, font=fs, fill=SLATE)
    img.save(f"{OV}/{name}.png")
    print(f"{name}.png")

title_card()

CAPS = [
    ("cap03","Secure Workspace","One platform. Four roles.","Role-based access for every player"),
    ("cap04","Step 1 — The Contract","Client posts a lease","Asset, route & destination in one place"),
    ("cap05","Smart Routing","Domestic vs Cross-Border","One toggle builds the right permit checklist"),
    ("cap06","Step 2 — Escrow","100% capital locked & secured","Funds protected until delivery"),
    ("cap07","The Supplier","Fleet & guaranteed payout","No predatory brokers. No delayed terms."),
    ("cap08","Physical Moat","Field inspector sign-off","On-site chassis, engine & mechanical audit"),
    ("cap09","Emergency Parts","Breakdown? Parts dispatched fast","Auto-approved against locked escrow"),
    ("cap10","Border Liaison","Agents at the OSBPs","Manual clearance when portals fail"),
    ("cap11","Step 3 — Settlement","Sign off. Auto-split payout.","7% commission, itemized invoices"),
    ("cap12","The Control Tower","Full operations overview","Live escrow, revenue & every contract"),
]
for c in CAPS:
    caption(*c)
print("DONE")
