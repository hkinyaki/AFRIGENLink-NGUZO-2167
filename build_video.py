"""
AFRIGEN tutorial assembly — reliable static-clip + crossfade approach (no zoompan).
Each visual is a held frame with caption overlay + edge fades; clips concatenated.
Then VO + ducked music muxed on top.
"""
import os, subprocess

ROOT = "/home/user/afrigen"
SH, AN, OV, VO = f"{ROOT}/shots", f"{ROOT}/anim", f"{ROOT}/overlays", f"{ROOT}/vo"
CLIPS = f"{ROOT}/clips"
os.makedirs(CLIPS, exist_ok=True)
FPS, W, H = 30, 1920, 1080

def dur(p):
    return float(subprocess.check_output(
        ["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",p]).strip())

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print("FFMPEG ERROR:\n", r.stderr[-1500:]); raise SystemExit(1)

SEGMENTS = [
    ("01", [(f"{AN}/intro_problem.png", "title_fade")]),
    ("02", [(f"{AN}/platform_diagram.png", None)]),
    ("03", [(f"{SH}/00-auth.png", f"{OV}/cap03.png")]),
    ("04", [(f"{SH}/client-pipeline.png", f"{OV}/cap04.png"), (f"{SH}/client-new.png", f"{OV}/cap04.png")]),
    ("05", [(f"{SH}/client-contract.png", f"{OV}/cap05.png")]),
    ("06", [(f"{SH}/client-contract.png", f"{OV}/cap06.png"), (f"{SH}/admin-overview.png", f"{OV}/cap06.png")]),
    ("07", [(f"{SH}/supplier-fleet.png", f"{OV}/cap07.png"), (f"{SH}/supplier-vault.png", f"{OV}/cap07.png")]),
    ("08", [(f"{SH}/field-audits.png", f"{OV}/cap08.png")]),
    ("09", [(f"{SH}/supplier-breakdown.png", f"{OV}/cap09.png")]),
    ("10", [(f"{SH}/field-border.png", f"{OV}/cap10.png")]),
    ("11", [(f"{SH}/client-contract.png", f"{OV}/cap11.png"), (f"{SH}/admin-ledger.png", f"{OV}/cap11.png")]),
    ("12", [(f"{SH}/admin-overview.png", f"{OV}/cap12.png")]),
    ("13", [(f"{AN}/close.png", "title_end")]),
]

clip_files = []
for seg, shots in SEGMENTS:
    seg_dur = dur(f"{VO}/seg{seg}.mp3") + 0.6
    each = seg_dur / len(shots)
    for j, (img, cap) in enumerate(shots):
        out = f"{CLIPS}/seg{seg}_{j}.mp4"
        inputs = ["-loop","1","-t",f"{each:.3f}","-i",img]
        fg = (f"[0:v]scale={W}:{H}:force_original_aspect_ratio=increase,"
              f"crop={W}:{H},setsar=1[bg]")
        last = "bg"
        if cap and isinstance(cap, str) and cap.endswith(".png"):
            inputs += ["-loop","1","-t",f"{each:.3f}","-i",cap]
            fg += ";[bg][1:v]overlay=0:0[v]"; last="v"
        elif cap == "title_fade":
            inputs += ["-loop","1","-t",f"{each:.3f}","-i",f"{OV}/title.png"]
            fg += ";[1:v]fade=t=out:st=3.4:d=0.8:alpha=1[t];[bg][t]overlay=0:0[v]"; last="v"
        elif cap == "title_end":
            inputs += ["-loop","1","-t",f"{each:.3f}","-i",f"{OV}/title.png"]
            fg += ";[1:v]fade=t=in:st=0.6:d=0.9:alpha=1[t];[bg][t]overlay=0:0[v]"; last="v"
        fg += f";[{last}]fade=t=in:st=0:d=0.45,fade=t=out:st={each-0.45:.3f}:d=0.45[outv]"
        run(["ffmpeg","-y"]+inputs+["-filter_complex",fg,"-map","[outv]","-r",str(FPS),
             "-c:v","libx264","-pix_fmt","yuv420p","-preset","veryfast","-crf","20", out])
        clip_files.append(out)
        print("clip", os.path.basename(out), f"{each:.1f}s")

with open(f"{CLIPS}/list.txt","w") as f:
    for c in clip_files: f.write(f"file '{c}'\n")
run(["ffmpeg","-y","-f","concat","-safe","0","-i",f"{CLIPS}/list.txt",
     "-c:v","libx264","-pix_fmt","yuv420p","-preset","veryfast","-crf","20", f"{ROOT}/video_silent.mp4"])
print("SILENT done")

# VO timeline
audio_inputs, filters, delays = [], [], []
cursor, idx = 0.0, 0
for seg, shots in SEGMENTS:
    block = dur(f"{VO}/seg{seg}.mp3") + 0.6
    audio_inputs += ["-i", f"{VO}/seg{seg}.mp3"]
    ms = int((cursor+0.15)*1000)
    filters.append(f"[{idx}:a]adelay={ms}|{ms}[a{idx}]")
    delays.append(f"[a{idx}]")
    cursor += block; idx += 1
total = cursor
filters.append("".join(delays)+f"amix=inputs={idx}:normalize=0[vo]")
run(["ffmpeg","-y"]+audio_inputs+["-filter_complex",";".join(filters),"-map","[vo]",
     "-t",f"{total:.3f}",f"{ROOT}/vo_full.wav"])
print("VO done", f"{total:.1f}s")

fc2 = (f"[1:a]volume=1.3[vo];"
       f"[2:a]volume=0.09,afade=t=in:st=0:d=2,afade=t=out:st={total-3:.2f}:d=3[bed];"
       f"[vo][bed]amix=inputs=2:normalize=0:duration=first[mix]")
run(["ffmpeg","-y","-i",f"{ROOT}/video_silent.mp4","-i",f"{ROOT}/vo_full.wav",
     "-i",f"{ROOT}/music/bed.mp3","-filter_complex",fc2,"-map","0:v","-map","[mix]",
     "-c:v","copy","-c:a","aac","-b:a","192k","-shortest",f"{ROOT}/AFRIGEN_tutorial.mp4"])
print("FINAL: AFRIGEN_tutorial.mp4", f"{total:.1f}s")
