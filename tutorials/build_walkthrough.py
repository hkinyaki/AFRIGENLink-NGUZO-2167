"""Build the Nguzo MASTER walkthrough from recorded role webms.

Reads raw/_videos.json (role webm paths + timing marks), extracts each role's
active segment window, scales to 1920x1080 on navy, syncs each segment to its
VO narration length, adds a lower-third caption + step badge, prepends a title
card, appends a close card, lays a ducked music bed under george VO.

Output: clips/master-walkthrough.mp4  (+ later 4 per-role clips).
Static-trim + concat only (no zoompan — hangs sandbox).
"""
import os, json, subprocess, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = "/home/user/afrigen/tutorials"
RAW  = f"{ROOT}/raw"
OUT  = f"{ROOT}/clips"
TMP  = f"{ROOT}/_wt_tmp"
CAP  = f"{ROOT}/wt_caps"
VO   = f"{ROOT}/wt_vo"
AN   = f"{ROOT}/anim"
for d in (OUT, TMP, CAP, VO): os.makedirs(d, exist_ok=True)

W, H = 1920, 1080
NAVY=(20,27,46); NAVY_DEEP=(13,18,32); NAVY_900=(10,14,26)
AMBER=(217,154,43); AMBER_LT=(235,180,90); SLATE=(150,165,186); WHITE=(244,246,250)
SORA=f"{ROOT}/../fonts/Sora.ttf"; MAN=f"{ROOT}/../fonts/Manrope.ttf"; MONO=f"{ROOT}/../fonts/IBMPlexMono.ttf"
def F(p,s): return ImageFont.truetype(p,s)

SEGDATA = json.load(open(f"{ROOT}/seg/_segs.json"))["segs"]
def segvid(sid): return SEGDATA[sid]
# Per-segment head trim (seconds) to skip the login + first navigation so only
# the active app content remains. Tuned from frame inspection (~11s login).
SKIP = {
 "post":11.5, "open":11.5, "bid1":11.5, "bid2":11.5, "award":11.5, "agree":11.5,
 "docs":11.5, "inspect":12.5, "permits":11.5, "pverify":11.5, "tt":11.5,
 "ttok":11.5, "exec":11.5, "timeline":11.5,
}

# ---------- SEGMENT SCRIPT ----------
# each: id (matches seg/_segs.json key), step#, phase label, caption, narration
SEGS = [
 dict(id="post", step="1", phase="CLIENT",
      cap="Post a job — quantity-demand tender",
      vo="A Nguzo job begins with the client. Geita Gold Construction needs five tipper trucks "
         "to haul six hundred tonnes of river sand from Dar es Salaam up to their Geita site. "
         "They simply pick the carrier type, the number of units they need, and the route. "
         "One job, opened to many suppliers."),
 dict(id="open", step="1", phase="CLIENT",
      cap="The staged-approval gate",
      vo="Every job runs through a strict staged gate — bidding, award, agreements, fleet documents, "
         "field inspection, permits, payment, then execution. Each step unlocks the next. Nothing is skipped."),
 dict(id="bid1", step="2", phase="SUPPLIER",
      cap="Suppliers bid — partial or full quantity",
      vo="Now suppliers compete. The first fleet owner offers two trucks at five hundred thousand "
         "shillings per unit. Suppliers can bid for part of the quantity, or all of it."),
 dict(id="bid2", step="2", phase="SUPPLIER",
      cap="A second supplier bids",
      vo="A second supplier offers three more trucks, at five hundred and forty thousand each. "
         "The demand fills up from multiple yards."),
 dict(id="award", step="3", phase="CLIENT",
      cap="Auto-award — cheapest fill, one flat fair price",
      vo="The client confirms the award. Nguzo automatically fills the cheapest bids until the quantity "
         "is met, then sets one flat fair price that every awarded supplier agrees to. "
         "Each supplier gets their own contract of agreement."),
 dict(id="agree", step="4", phase="SUPPLIER",
      cap="Download, sign & upload the agreement",
      vo="Each awarded supplier downloads their contract of agreement, signs it, and uploads the signed copy. "
         "Only then does the gate move forward."),
 dict(id="docs", step="5", phase="SUPPLIER",
      cap="Upload fleet & machine documents",
      vo="Next, each supplier uploads their fleet documents — registration, inspection certificates and "
         "insurance — ready for physical verification on the ground."),
 dict(id="inspect", step="6", phase="FIELD FORCE",
      cap="Boots on the ground — field inspection",
      vo="This is the Nguzo moat. A field inspector physically visits the yard, reads the chassis number, "
         "checks the undercarriage, hydraulics and load rating, and confirms the documents match the real "
         "machines on the ground. No remote rubber-stamping."),
 dict(id="permits", step="7", phase="CLIENT",
      cap="Permits uploaded for verification",
      vo="With the fleet verified, the client uploads the transit permits — here, a TARURA heavy-load "
         "permit — and submits them for verification."),
 dict(id="pverify", step="8", phase="NGUZO HQ",
      cap="Nguzo HQ verifies the permits",
      vo="Nguzo headquarters reviews and verifies the permits. Every regulatory document is checked "
         "before any money moves."),
 dict(id="tt", step="9", phase="CLIENT",
      cap="Funding the job — escrow preview",
      vo="Now the client funds the job. They upload proof of the bank transfer. The capital is held in "
         "Nguzo's account and previewed as escrow — funds tracked, released only when the work is signed off."),
 dict(id="ttok", step="10", phase="NGUZO HQ",
      cap="HQ confirms payment received",
      vo="Headquarters confirms the payment has landed. The escrow is now recorded as held by Nguzo, "
         "protecting both the client and the suppliers."),
 dict(id="exec", step="11", phase="NGUZO HQ",
      cap="Approved to execute",
      vo="With everything in place, Nguzo gives the final approval to execute. The suppliers and the field "
         "force are cleared to begin the haul."),
 dict(id="timeline", step="✓", phase="EXECUTION",
      cap="Live tracker, escrow & split settlement",
      vo="The full timeline is on record — every step, every actor, every document. On sign-off, Nguzo "
         "settles automatically: each supplier paid their share, the seven percent service fee deducted, "
         "and itemised invoices generated. That is the Nguzo flywheel, secured end to end."),
]

# ---------- captions ----------
def make_cap(seg):
    img = Image.new("RGBA",(W,H),(0,0,0,0)); d=ImageDraw.Draw(img)
    # lower-third gradient band
    band_h=210; band=Image.new("RGBA",(W,band_h),(0,0,0,0)); bd=ImageDraw.Draw(band)
    for i in range(band_h):
        a=int(230*(i/band_h)**0.7)
        bd.line([(0,i),(W,i)], fill=(10,14,26,a))
    img.alpha_composite(band,(0,H-band_h))
    y=H-130
    # step badge
    badge=f"STEP {seg['step']}"
    bw=300
    d.rounded_rectangle([70,y-6,70+bw,y+58], radius=10, fill=(217,154,43,255))
    d.text((70+24,y+26), seg["phase"], font=F(MONO,26), fill=NAVY, anchor="lm")
    # caption text
    d.text((70, y+96), seg["cap"], font=F(SORA,52), fill=WHITE, anchor="lm")
    # step pill right
    d.text((W-70, y+26), badge, font=F(MONO,28), fill=AMBER_LT, anchor="rm")
    p=f"{CAP}/{seg['id']}.png"; img.save(p); return p

# ---------- helpers ----------
def run(cmd): subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
def dur(f):
    return float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration",
                                          "-of","csv=p=0",f]).decode().strip())

def build_segment(seg):
    src=segvid(seg["id"])
    t0=SKIP.get(seg["id"], 11.5)
    total=dur(src)
    raw_len=max(total-t0-0.3, 2.0)   # from end of login to end of clip
    # VO
    vo_path=f"{VO}/{seg['id']}.mp3"
    if not os.path.exists(vo_path):
        subprocess.run(["say","-v","george",seg["vo"],"-o",vo_path],check=True,
                       stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    vlen=dur(vo_path)
    target=vlen+1.4                       # narration + a small tail to read the screen
    # speed factor to fit raw window into target (PTS multiplier). Clamp so it never
    # looks frantic or painfully slow.
    spd = raw_len/target                  # >1 => need to speed up source
    setpts = 1.0/spd if spd>0 else 1.0
    setpts = max(0.5, min(setpts, 2.2))   # clamp playback 0.45x..2x
    cap=make_cap(seg)
    out=f"{TMP}/{seg['id']}.mp4"
    # retime source, scale/pad, overlay caption, then CLONE last frame (tpad) so
    # the clip always reaches exactly `target` with valid CFR — then hard-trim.
    vf=(f"trim=start={t0:.2f}:duration={raw_len:.2f},setpts=PTS-STARTPTS,"
        f"setpts={setpts:.4f}*PTS,"
        f"scale={W}:{H}:force_original_aspect_ratio=decrease,"
        f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=0x0A0E1A,fps=30,"
        f"tpad=stop_mode=clone:stop_duration={target+1.0:.2f}")
    # build silent visual sized to target via -t after retime
    run(["ffmpeg","-y","-i",src,"-i",cap,
         "-filter_complex", f"[0:v]{vf}[v];[v][1:v]overlay=0:0:format=auto,trim=0:{target:.2f},setpts=PTS-STARTPTS[vv]",
         "-map","[vv]","-an",
         "-c:v","libx264","-preset","veryfast","-crf","19","-pix_fmt","yuv420p", f"{TMP}/{seg['id']}_v.mp4"])
    # audio: VO padded to target
    run(["ffmpeg","-y","-i",vo_path,"-af",f"apad=pad_dur=2,atrim=0:{target:.2f},aresample=44100",
         "-t",f"{target:.2f}","-c:a","aac","-b:a","160k", f"{TMP}/{seg['id']}_a.mp4"])
    run(["ffmpeg","-y","-i",f"{TMP}/{seg['id']}_v.mp4","-i",f"{TMP}/{seg['id']}_a.mp4",
         "-c:v","copy","-c:a","copy","-shortest", out])
    print(f"  seg {seg['id']:9s} raw={raw_len:5.1f}s vo={vlen:4.1f}s -> {dur(out):4.1f}s (setpts {setpts:.2f})")
    return out

def card_clip(png, secs, vo_text=None, name="card"):
    out=f"{TMP}/{name}.mp4"
    if vo_text:
        vp=f"{VO}/{name}.mp3"
        if not os.path.exists(vp):
            subprocess.run(["say","-v","george",vo_text,"-o",vp],check=True,
                           stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        secs=max(secs, dur(vp)+1.0)
        run(["ffmpeg","-y","-loop","1","-i",png,"-i",vp,
             "-vf",f"scale={W}:{H},fps=30","-t",f"{secs:.2f}",
             "-af",f"apad=pad_dur=1.5,atrim=0:{secs:.2f},aresample=44100",
             "-c:v","libx264","-preset","veryfast","-crf","19","-pix_fmt","yuv420p",
             "-c:a","aac","-b:a","160k","-shortest", out])
    else:
        run(["ffmpeg","-y","-loop","1","-i",png,"-f","lavfi","-i","anullsrc=r=44100:cl=stereo",
             "-vf",f"scale={W}:{H},fps=30","-t",f"{secs:.2f}",
             "-c:v","libx264","-preset","veryfast","-crf","19","-pix_fmt","yuv420p",
             "-c:a","aac","-b:a","160k","-shortest", out])
    return out

def concat(parts, out):
    lst=f"{TMP}/list.txt"
    with open(lst,"w") as f:
        for p in parts: f.write(f"file '{p}'\n")
    # re-encode on concat to normalise PTS/timebase (copy left a broken duration)
    run(["ffmpeg","-y","-f","concat","-safe","0","-i",lst,
         "-fflags","+genpts","-c:v","libx264","-preset","veryfast","-crf","19",
         "-pix_fmt","yuv420p","-c:a","aac","-b:a","160k","-vsync","cfr","-r","30", out])

def add_music(video, out):
    bed=f"{ROOT}/wt_music.mp3"
    if not os.path.exists(bed):
        subprocess.run(["music","-d","60","corporate ambient underscore, calm confident, soft pulse, "
                        "minimal piano and warm pad, B2B tech, unobtrusive",
                        "-o",bed],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    vlen=dur(video)
    # loop music, duck under VO with sidechain
    run(["ffmpeg","-y","-i",video,"-stream_loop","-1","-i",bed,
         "-filter_complex",
         f"[1:a]aloop=loop=-1:size=2e9,atrim=0:{vlen:.2f},volume=0.13[bed];"
         f"[0:a]volume=1.0[vo];"
         f"[bed][vo]sidechaincompress=threshold=0.03:ratio=8:attack=8:release=320[ducked];"
         f"[vo][ducked]amix=inputs=2:duration=first:weights=1 1[a]",
         "-map","0:v","-map","[a]","-c:v","copy","-c:a","aac","-b:a","192k","-shortest",out])

if __name__=="__main__":
    import sys
    print("Building segments…")
    seg_clips=[build_segment(s) for s in SEGS]
    title=card_clip(f"{AN}/title.png", 5.5,
        vo_text="This is Nguzo Africa — cargo and machinery coordination, secured. "
                "Here is exactly how a job flows through the platform, from the first post to final settlement.",
        name="title")
    close=card_clip(f"{AN}/close.png", 5.0,
        vo_text="Nguzo Africa. The pillar behind every deal.", name="close")
    parts=[title]+seg_clips+[close]
    silent=f"{OUT}/_master_nomusic.mp4"
    concat(parts, silent)
    print("Adding music bed…")
    master=f"{OUT}/master-walkthrough.mp4"
    add_music(silent, master)
    print("MASTER", master, round(dur(master),1),"s")
