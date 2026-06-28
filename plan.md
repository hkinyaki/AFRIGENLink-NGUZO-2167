# Plan — Cursor-to-Narration Sync (fix the real cause + self-verify every video)

## The problem (honest diagnosis)
You keep seeing the **mouse cursor lag behind the narrator**. My previous fixes only matched the *total length* of each segment to the voiceover. That is not enough. Inside a segment the cursor moves on a **fixed `beat()` timer that was written separately from the script** — so the narrator can say "click Inspect" at second 14 while the cursor already clicked it at second 8. Stretching the whole clip shifts everything uniformly but never lines up the individual *moments*. That mismatch is exactly what frustrates you, and it will keep happening until the narration itself drives the cursor.

## The fix (one approach, done right)
Make the **voiceover the conductor**. Each segment's narration is split into ordered **lines**, each line has a known spoken duration (from the TTS), and each line is paired with **one cursor action** (hover / move / click / type / scroll). During recording the cursor performs action N **for exactly as long as line N is spoken**. When the narrator moves to the next sentence, the cursor moves to the next thing. Result: the cursor and the words are locked together by construction — not patched afterward.

Then I **analyse every rendered video automatically before showing it to you**, so you never have to catch a sync error again.

### Concrete steps

1. **Per-line VO + timings** — `tutorials/vo_roles.py`
   - Restructure each segment from one big paragraph into an **ordered list of short lines** (one action-worth of narration each).
   - Generate one mp3 per line, measure each line's exact duration, and write `_durs.json` with the **per-line timeline** (line text + start + duration), not just a total.

2. **Narration-driven cursor** — `tutorials/record_flow_roles.py`
   - Replace fixed `beat(pg, 1700)` choreography with a **timeline player**: for each segment, read the per-line durations and run `action(line_i)` so the cursor holds on that element for exactly that line's spoken length (with a small lead-in so the cursor *arrives just before* the word is said — natural, like a presenter).
   - Map every line to its real UI target (the button/field/row it talks about). Reuse existing helpers (`move_to`, `ripple_at`, `click_text`, `type_into`, `slow_scroll`).
   - Record per-line so footage length per line ≈ VO length per line → almost no stretching needed later.

3. **Builder becomes near-zero-stretch** — `tutorials/build_role_clips.py`
   - Because footage is already line-matched, `setpts` stays ~1.0. Keep the gentle clamp only as a tiny safety net (±10%). Concat lines → segment, segment → full video, lay ducked music. No more big compress/hold.

4. **AUTOMATIC SYNC AUDIT before delivery** — new `tutorials/verify_sync.py`
   - For every segment: compare footage line-boundaries vs VO line-boundaries; flag any line where the drift between "cursor acts" and "narrator says it" exceeds **±0.4s**.
   - Sample frames at each narration line's midpoint and confirm the captioned UI element is actually on screen and the cursor is near it.
   - Print a pass/fail table. **I do not deliver until every line passes.** If any fails, I re-record just that segment and re-audit.

5. **Apply to all four roles** — rebuild **Supplier** first (your current preview), self-audit, then only show you once it passes. Same engine then reused for **Client** re-do, **Field** re-do, and **Admin** new build.

## How you'll know it's right
- A printed audit table per video: every narration line shows drift ≤ ±0.4s, cursor-on-target = yes.
- Spot frames at line midpoints prove the cursor is on the element being described.
- You watch a video where the cursor touches each thing **as** the narrator names it — not before, not after.

## Order of delivery
1. Rebuild **Supplier** with the new engine → self-audit → deliver for your approval of the method.
2. On approval: **Client**, **Field** re-rendered + **Admin** built the same way.
3. Then the 4 PDF booklets + system finalize (unchanged from prior plan).

## Guardrails I'm committing to
- I **analyse every video myself** (audit table + frame checks) **before** presenting it. No exceptions.
- VO-locked, line-level sync — not whole-segment stretching.
- No speeding footage into a blur and no freezing on a held frame.
