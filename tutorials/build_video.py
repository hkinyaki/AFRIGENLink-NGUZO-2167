"""Nguzo overview clip assembly — static-clip + crossfade (no zoompan).
Each VO segment -> a held frame (concept or screenshot) with caption + edge fades.
Then VO timeline + ducked music bed muxed on top."""
import os, subprocess

ROOT = "/home/user/afrigen/tutorials"
SH = "/home/user/afrigen/shots/qa"
AN, OV, VO = f"{ROOT}/anim", f"{ROOT}/overlays", f"{ROOT}/vo"
CLIPS = f"{ROOT}/clips/_overview_parts"
os.makedirs(CLIPS, exist_ok=True)
FPS, W, H = 30, 1920, 1080
OUT = f"{ROOT}/clips/overview.mp4"

def dur(p):
    return float(subprocess.check_output(
        ["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",p]).strip())

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print("FFMPEG ERROR:\n", r.stderr[-1800:]); raise SystemExit(1)

# seg -> (image, overlay) ; overlay: "title"/"close"/path-to-cap/None
SEGMENTS = [
    ("01", [(f"{AN}/title.png", "title")]),
    ("02", [(f"{AN}/problem.png", None)]),
    ("03", [(f"{AN}/pillar.png", None)]),
    ("04", [(f"{SH}/10-client-job-bidding.png", f"{OV}/cap04.png")]),
    ("05", [(f"{SH}/11-supplier-bid.png", f"{OV}/cap05.png")]),
    ("06", [(f"{SH}/12-client-bids-in.png", f"{OV}/cap06.png"), (f"{SH}/13-client-awarded.png", f"{OV}/cap06.png")]),
    ("07", [(f"{SH}/16-client-tt.png", f"{OV}/cap07.png")]),
    ("08", [(f"{SH}/20-field-inspections.png", f"{OV}/cap08.png"), (f"{SH}/21-field-inspect.png", f"{OV}/cap08.png")]),
    ("09", [(f"{AN}/gate.png", None)]),
    ("10", [(f"{AN}/corridors.png", None)]),
    ("11", [(f"{SH}/32-admin-confirm-tt.png", f"{OV}/cap11.png"), (f"{SH}/33-admin-executing.png", f"{OV}/cap11.png")]),
    ("12", [(f"{AN}/close.png", "close")]),
]

clip_files = []
for seg, shots in SEGMENTS:
    seg_dur = dur(f"{VO}/seg{seg}.mp3") + 0.7
    each = seg_dur / len(shots)
    for j,(img,cap) in enumerate(shots):
        out = f"{CLIPS}/seg{seg}_{j}.mp4"
        inputs = ["-loop","1","-t",f"{each:.3f}","-i",img]
        fg = (f"[0:v]scale={W}:{H}:force_original_aspect_ratio=increase,"
              f"crop={W}:{H},setsar=1[bg]")
        last="bg"
        if cap and cap.endswith(".png") and cap not in ("title","close"):
            inputs += ["-loop","1","-t",f"{each:.3f}","-i",cap]
            fg += ";[bg][1:v]overlay=0:0[v]"; last="v"
        elif cap=="title":
            inputs += ["-loop","1","-t",f"{each:.3f}","-i",f"{AN}/title.png"]
            fg += ";[1:v]fade=t=out:st=4.2:d=1.0:alpha=1[t];[bg][t]overlay=0:0[v]"; last="v"
        elif cap=="close":
            inputs += ["-loop","1","-t",f"{each:.3f}","-i",f"{AN}/close.png"]
            fg += ";[1:v]fade=t=in:st=0.5:d=1.0:alpha=1[t];[bg][t]overlay=0:0[v]"; last="v"
        fg += f";[{last}]fade=t=in:st=0:d=0.5,fade=t=out:st={each-0.5:.3f}:d=0.5[outv]"
        run(["ffmpeg","-y"]+inputs+["-filter_complex",fg,"-map","[outv]","-r",str(FPS),
             "-c:v","libx264","-pix_fmt","yuv420p","-preset","veryfast","-crf","20", out])
        clip_files.append(out)
        print("clip", os.path.basename(out), f"{each:.1f}s")

with open(f"{CLIPS}/list.txt","w") as f:
    for c in clip_files: f.write(f"file '{c}'\n")
run(["ffmpeg","-y","-f","concat","-safe","0","-i",f"{CLIPS}/list.txt",
     "-c:v","libx264","-pix_fmt","yuv420p","-preset","veryfast","-crf","20", f"{ROOT}/_silent.mp4"])
print("SILENT done")

# VO timeline
ai, filt, delays = [], [], []
cursor, idx = 0.0, 0
for seg, shots in SEGMENTS:
    block = dur(f"{VO}/seg{seg}.mp3") + 0.7
    ai += ["-i", f"{VO}/seg{seg}.mp3"]
    ms = int((cursor+0.18)*1000)
    filt.append(f"[{idx}:a]adelay={ms}|{ms}[a{idx}]")
    delays.append(f"[a{idx}]")
    cursor += block; idx += 1
total = cursor
filt.append("".join(delays)+f"amix=inputs={idx}:normalize=0[vo]")
run(["ffmpeg","-y"]+ai+["-filter_complex",";".join(filt),"-map","[vo]","-t",f"{total:.3f}",f"{ROOT}/_vo.wav"])
print("VO done", f"{total:.1f}s")

# music bed
bed = f"{ROOT}/_bed.mp3"
if not os.path.exists(bed):
    subprocess.run(["music","-d",str(int(total)+2),
        "cinematic corporate ambient, warm low strings and soft pulse, hopeful, understated, East Africa infrastructure, no drums lead",
        "-o",bed], check=True)
print("bed ready")

fc2 = (f"[1:a]volume=1.35[vo];"
       f"[2:a]volume=0.10,afade=t=in:st=0:d=2,afade=t=out:st={total-3:.2f}:d=3[bed];"
       f"[vo][bed]amix=inputs=2:normalize=0:duration=first[mix]")
run(["ffmpeg","-y","-i",f"{ROOT}/_silent.mp4","-i",f"{ROOT}/_vo.wav","-i",bed,
     "-filter_complex",fc2,"-map","0:v","-map","[mix]",
     "-c:v","copy","-c:a","aac","-b:a","192k","-shortest",OUT])
print("FINAL:",OUT, f"{total:.1f}s")
