# Client training video desync fix (segments from 3:00)

## Root cause
In 4 job-detail segments cursor reached action button by line 1 and PARKED while
narrator described rows; earlier hover targets didn't resolve. Also payment/permits
recorded head ~46s (async render ate first VO lines).

## Done
- [x] Rewrite bids-award/awarded/permits/payment in vo_lines.py — distinct anchors per line,
      action button only on its naming line via hoverbtn, explanation lines hover
      Status/Activity/Documents/headers (verified exact rendered strings in client.tsx).
- [x] Fixed bids-award line4 string: "auto-fill cheapest" (was "auto-fills the cheapest").
- [x] record_synced.py: MISS logging in text_box/btn_box; wait_anchor() helper;
      added wait_anchor to the 4 job-detail client_starts (Bids(/Awarded Suppliers/
      Your step — Upload permits/Your step — Payment proof).
- [x] Regenerated VO: bids 38.1 / awarded 41.1 / permits 39.0 / payment 46.3s.

## Next
- [ ] Re-seed: cd packages/web && bun --env-file=../../.env src/api/demo-seed.ts
- [ ] Re-record 4: ONLY_SEG=bids-award,awarded,permits,payment python3 record_synced.py client
- [ ] Rebuild: python3 build_role_clips.py client
- [ ] verify_sync.py client + montage the 4 segs audit frames -> inspect EVERY frame
- [ ] Confirm permits/payment head ~16s; setpts ~1.0; spot-play 3:00/3:38/4:16/4:55
- [ ] Deliver

## Then (queued)
- Admin training video (~11min)

## RESOLVED (June 20 2026)
- Root cause #2 found via audit: 'awarded' & 'permits' shared fv_tid; pre-uploading a
  permit doc to fv_tid bled the "Submit permits" button into the awarded segment.
  FIX = dedicated pm_tid (Drainage culvert — Tabora, FieldVerified + permit doc) for permits;
  fv_tid (Foundation earthworks — Dodoma) stays CLEAN for awarded.
- Heads dropped 46s -> ~17.7s (wait_anchor). setpts all ~1.0 (no freeze). 0 MISS.
- Frame-by-frame verified all 4 segs: cursor on the named element every line.
- Final: clips/training-client.mp4 410.3s (~6m50s), 1920x1080 h264+aac.
- DELIVERED for approval. Next queued: ADMIN training video (~11min).
