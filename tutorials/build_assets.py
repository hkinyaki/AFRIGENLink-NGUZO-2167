"""Nguzo Africa overview clip — title cards, concept frames, caption lower-thirds.
1920x1080. Navy #141B2E / amber #D99A2B, Sora + Manrope + IBM Plex Mono."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os, math

ROOT = "/home/user/afrigen/tutorials"
OV = f"{ROOT}/overlays"
AN = f"{ROOT}/anim"
os.makedirs(OV, exist_ok=True); os.makedirs(AN, exist_ok=True)

NAVY      = (20, 27, 46)     # #141B2E
NAVY_DEEP = (13, 18, 32)
NAVY_900  = (10, 14, 26)
AMBER     = (217, 154, 43)   # #D99A2B
AMBER_LT  = (235, 180, 90)
SLATE     = (148, 163, 184)
WHITE     = (244, 246, 250)
INK       = (228, 233, 242)

SORA = f"{ROOT}/../fonts/Sora.ttf"
MAN  = f"{ROOT}/../fonts/Manrope.ttf"
MONO = f"{ROOT}/../fonts/IBMPlexMono.ttf"
LOGO = f"{ROOT}/../packages/web/public/logo.png"

def F(p, s): return ImageFont.truetype(p, s)
W, H = 1920, 1080

def grid(d, color=(24,33,56)):
    for x in range(0, W, 96): d.line([(x,0),(x,H)], fill=color, width=1)
    for y in range(0, H, 96): d.line([(0,y),(W,y)], fill=color, width=1)

def vignette(img):
    v = Image.new("L",(W,H),0); dv=ImageDraw.Draw(v)
    dv.ellipse([-W*0.3,-H*0.3,W*1.3,H*1.3], fill=255)
    v=v.filter(ImageFilter.GaussianBlur(220))
    dark=Image.new("RGB",(W,H),NAVY_900)
    return Image.composite(img, dark, v)

def logo_mark(size):
    lg = Image.open(LOGO).convert("RGBA").resize((size,size), Image.LANCZOS)
    return lg

def ctext(d, cx, y, txt, font, fill, anchor="mm", ls=0):
    if ls:
        # letter spacing
        total = sum(d.textlength(c,font=font)+ls for c in txt)-ls
        x = cx-total/2
        for c in txt:
            d.text((x,y), c, font=font, fill=fill, anchor="lm")
            x += d.textlength(c,font=font)+ls
    else:
        d.text((cx,y), txt, font=font, fill=fill, anchor=anchor)

# ---------------- TITLE CARD (open) ----------------
def title_card():
    img = Image.new("RGB",(W,H),NAVY_DEEP); d=ImageDraw.Draw(img)
    grid(d)
    img = vignette(img); d=ImageDraw.Draw(img)
    lg = logo_mark(260)
    img.paste(lg,(W//2-130, H//2-300), lg)
    ctext(d, W//2, H//2+70, "NGUZO AFRICA", F(SORA,118), WHITE, ls=8)
    # amber rule
    d.rectangle([W//2-230, H//2+150, W//2+230, H//2+154], fill=AMBER)
    ctext(d, W//2, H//2+210, "CARGO & MACHINERY COORDINATION — SECURED", F(MONO,30), AMBER_LT, ls=4)
    img.save(f"{AN}/title.png"); print("title")

# ---------------- CLOSE CARD ----------------
def close_card():
    img = Image.new("RGB",(W,H),NAVY_DEEP); d=ImageDraw.Draw(img)
    grid(d); img=vignette(img); d=ImageDraw.Draw(img)
    lg = logo_mark(200)
    img.paste(lg,(W//2-100, H//2-280), lg)
    ctext(d, W//2, H//2-20, "The pillar behind every deal.", F(SORA,72), WHITE)
    d.rectangle([W//2-180, H//2+50, W//2+180, H//2+54], fill=AMBER)
    ctext(d, W//2, H//2+120, "nguzo.africa", F(MONO,38), AMBER_LT, ls=4)
    img.save(f"{AN}/close.png"); print("close")

# ---------------- CONCEPT: TRUST PROBLEM ----------------
def concept_problem():
    img = Image.new("RGB",(W,H),NAVY_DEEP); d=ImageDraw.Draw(img)
    grid(d); img=vignette(img); d=ImageDraw.Draw(img)
    ctext(d, W//2, 150, "THE TRUST PROBLEM", F(MONO,30), AMBER_LT, ls=6)
    cards = [
        ("CLIENTS", "Pay — and risk\nequipment that\nnever arrives."),
        ("OWNERS",  "Work — and risk\nnever getting\npaid."),
        ("BROKERS", "Add cost — and\ncarry no\naccountability."),
    ]
    cw, ch, gap = 420, 360, 80
    total = cw*3+gap*2; x0=(W-total)//2; y0=H//2-120
    for i,(t,b) in enumerate(cards):
        x=x0+i*(cw+gap)
        d.rounded_rectangle([x,y0,x+cw,y0+ch], radius=22, fill=(26,35,58), outline=(44,56,86), width=2)
        d.rectangle([x,y0,x+8,y0+ch], fill=(190,70,60))
        ctext(d, x+cw//2, y0+60, t, F(SORA,42), WHITE)
        d.line([x+60,y0+110,x+cw-60,y0+110], fill=(60,72,104), width=2)
        yy=y0+150
        for line in b.split("\n"):
            ctext(d, x+cw//2, yy, line, F(MAN,30), SLATE); yy+=44
    img.save(f"{AN}/problem.png"); print("problem")

# ---------------- CONCEPT: PILLAR (Nguzo in middle) ----------------
def concept_pillar():
    img = Image.new("RGB",(W,H),NAVY_DEEP); d=ImageDraw.Draw(img)
    grid(d); img=vignette(img); d=ImageDraw.Draw(img)
    ctext(d, W//2, 130, "ONE COORDINATED LAYER", F(MONO,30), AMBER_LT, ls=6)
    # center hub
    cx,cy=W//2,H//2+30
    lg=logo_mark(180); img.paste(lg,(cx-90,cy-90),lg)
    d.ellipse([cx-130,cy-130,cx+130,cy+130], outline=AMBER, width=3)
    # three nodes
    nodes=[("CLIENTS",-1),("OWNERS",1),("GROUND FORCE",0)]
    pos=[(cx-560,cy),(cx+560,cy),(cx,cy+330)]
    labels=["CLIENTS","OWNERS","GROUND FORCE"]
    for (px,py),lb in zip(pos,labels):
        d.line([cx,cy,px,py], fill=(70,84,120), width=3)
    for (px,py),lb in zip(pos,labels):
        bw=300; bh=92
        d.rounded_rectangle([px-bw//2,py-bh//2,px+bw//2,py+bh//2], radius=16, fill=(26,35,58), outline=(60,80,120), width=2)
        ctext(d, px, py, lb, F(SORA,34), WHITE)
    img.save(f"{AN}/pillar.png"); print("pillar")

# ---------------- CONCEPT: STAGED GATE ----------------
def concept_gate():
    img = Image.new("RGB",(W,H),NAVY_DEEP); d=ImageDraw.Draw(img)
    grid(d); img=vignette(img); d=ImageDraw.Draw(img)
    ctext(d, W//2, 150, "THE STAGED GATE", F(MONO,30), AMBER_LT, ls=6)
    steps=["Award","Agreement","Documents","Inspection","Permits","Payment","Execute"]
    n=len(steps); cw=200; gap=40; total=cw*n+gap*(n-1)
    x0=(W-total)//2; y=H//2; ch=120
    for i,s in enumerate(steps):
        x=x0+i*(cw+gap)
        fill=(26,35,58); oc=(60,80,120)
        d.rounded_rectangle([x,y-ch//2,x+cw,y+ch//2], radius=16, fill=fill, outline=oc, width=2)
        d.ellipse([x+cw//2-22,y-46,x+cw//2+22,y-2], fill=AMBER)
        ctext(d, x+cw//2, y-24, str(i+1), F(SORA,28), NAVY_DEEP)
        ctext(d, x+cw//2, y+30, s, F(MAN,26), INK)
        if i<n-1:
            ax=x+cw+gap//2
            d.polygon([(ax-10,y-10),(ax+10,y),(ax-10,y+10)], fill=AMBER)
    ctext(d, W//2, y+150, "each step verified before the next begins", F(MAN,30), SLATE)
    img.save(f"{AN}/gate.png"); print("gate")

# ---------------- CONCEPT: CORRIDOR MAP ----------------
def concept_corridors():
    img = Image.new("RGB",(W,H),NAVY_DEEP); d=ImageDraw.Draw(img)
    grid(d); img=vignette(img); d=ImageDraw.Draw(img)
    ctext(d, W//2, 130, "THREE CORRIDORS", F(MONO,30), AMBER_LT, ls=6)
    hub=(W//2-120,H//2+120)
    d.ellipse([hub[0]-16,hub[1]-16,hub[0]+16,hub[1]+16], fill=AMBER)
    ctext(d, hub[0], hub[1]+50, "DAR ES SALAAM", F(MAN,28), WHITE)
    ends=[((W//2+480,H//2-260),"NORTHERN — Namanga"),
          ((W//2+520,H//2-30),"CENTRAL — Rwanda/Burundi"),
          ((W//2-340,H//2-220),"SOUTHERN — Tunduma")]
    for (ex,ey),lb in ends:
        d.line([hub[0],hub[1],ex,ey], fill=AMBER, width=3)
        d.ellipse([ex-12,ey-12,ex+12,ey+12], fill=AMBER_LT)
        anchor = "lm" if ex>hub[0] else "rm"
        d.text((ex+(24 if ex>hub[0] else -24), ey), lb, font=F(MAN,28), fill=INK, anchor=anchor)
    img.save(f"{AN}/corridors.png"); print("corridors")

# ---------------- CAPTION LOWER-THIRDS ----------------
def caption(sid, text):
    img = Image.new("RGBA",(W,H),(0,0,0,0)); d=ImageDraw.Draw(img)
    # gradient bottom scrim
    scrim = Image.new("RGBA",(W,260),(0,0,0,0)); ds=ImageDraw.Draw(scrim)
    for i in range(260):
        a=int(200*(i/260))
        ds.line([(0,i),(W,i)], fill=(8,12,22,a))
    img.alpha_composite(scrim,(0,H-260))
    # amber bar + text
    bx=120; by=H-150
    d.rectangle([bx,by,bx+8,by+70], fill=AMBER)
    d.text((bx+34,by-4), text, font=F(SORA,52), fill=WHITE, anchor="lm")
    # logo small bottom-right
    lg=logo_mark(70); img.alpha_composite(lg.convert("RGBA"),(W-130,H-130))
    img.save(f"{OV}/cap{sid}.png"); print("cap",sid)

if __name__=="__main__":
    title_card(); close_card()
    concept_problem(); concept_pillar(); concept_gate(); concept_corridors()
    caps = {
        "04":"Post a job — pick a type, set the quantity",
        "05":"Verified suppliers bid for part or all",
        "06":"Auto-fill award at one fair price",
        "07":"Funds secured in escrow before wheels turn",
        "08":"Field & border agents on the ground",
        "10":"Tanzania + three corridors",
        "11":"Automatic split settlement on sign-off",
    }
    for sid,t in caps.items(): caption(sid,t)
    print("ASSETS DONE")
