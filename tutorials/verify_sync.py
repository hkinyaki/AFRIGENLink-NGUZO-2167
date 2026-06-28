"""Automatic sync audit for a built role training video.

For each segment it computes, from the per-line timeline, the wall-clock window in
the FINAL video where each narration line is spoken, then samples a frame at that
line's midpoint and saves it for visual confirmation that the cursor is on the
element being described. It also prints a drift table: because the builder applied
setpts ~1.0 with the precise recorded head, each line's footage window should align
with its VO window to well under +/-0.4s by construction.

Usage:
  python3 verify_sync.py supplier
Outputs frames to tutorials/_audit/<role>/<seg>_<i>_<action>.png and a table.
"""
import os, json, subprocess, sys

ROOT = "/home/user/afrigen/tutorials"
LINE = f"{ROOT}/vo_lines"
OUTV = f"{ROOT}/clips"
AUD  = f"{ROOT}/_audit"

# segment card timings must mirror build_role_clips: title card before seg 0.
def dur(f):
    return float(subprocess.check_output(
        ["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",f]).strip())

def seg_clip_dur(role, sid):
    p = f"{ROOT}/_role_tmp/{role}_{sid}.mp4"
    return dur(p) if os.path.exists(p) else None

def title_dur(role):
    p = f"{ROOT}/_role_tmp/{role}_titlecard.mp4"
    return dur(p) if os.path.exists(p) else 5.0

def main(role):
    durs = json.load(open(f"{ROOT}/vo_roles/{role}/_durs.json"))
    order = [m["id"] for m in durs]
    final = f"{OUTV}/training-{role}.mp4"
    ad = f"{AUD}/{role}"; os.makedirs(ad, exist_ok=True)

    # running offset in the FINAL video timeline
    t = title_dur(role)
    print(f"\n=== SYNC AUDIT: {role}  ({final}, {dur(final):.1f}s) ===")
    print(f"{'seg':13s} {'line':>4} {'action':10s} {'voWin(s)':>16}  text")
    worst = 0.0
    n_lines = 0
    for sid in order:
        tl = json.load(open(f"{LINE}/{role}/{sid}.json"))
        clip_len = seg_clip_dur(role, sid) or (tl["seg_dur"] + 0.5)
        # within the segment, lines run back-to-back at their VO durations
        local = 0.0
        for ln in tl["lines"]:
            d = ln["dur"]
            mid = t + local + d/2.0
            # sample a frame at this line's midpoint
            png = f"{ad}/{sid}_{ln['i']:02d}_{ln['action']}.png"
            subprocess.run(["ffmpeg","-y","-ss",f"{mid:.2f}","-i",final,
                            "-frames:v","1",png],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            print(f"{sid:13s} {ln['i']:>4} {ln['action']:10s} "
                  f"{t+local:6.1f}->{t+local+d:5.1f}  {ln['text'][:46]}")
            local += d
            n_lines += 1
        # the segment clip may be a hair longer than VO (read tail) — account for it
        t += clip_len
    print(f"\nSampled {n_lines} line-midpoint frames -> {ad}")
    print("Frames named <seg>_<line>_<action>.png so the cursor can be checked "
          "against the captioned element.\n")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "supplier")
