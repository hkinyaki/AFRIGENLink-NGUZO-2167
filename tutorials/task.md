# Nguzo per-role training videos — narration-driven cursor engine

## STATUS
- Engine approved (supplier was method preview). Each VO line = one cursor action held for line's spoken length. Per-seg fresh Playwright context (no VFR drift). setpts ~1.0.
- DELIVERED/built:
  - training-supplier.mp4 — 5m41s, approved
  - training-field.mp4 — 5m26s, 1920x1080 h264+aac 15MB, 11 segs + title/close + music. AUDITED 67/67 frames PASS. >> AWAITING APPROVAL (preview)
- record_synced.py: supplier + field wired (field_starts + setup_inspect_ready_tender). selectidx/check/typeph(textarea+number) actions in do_action.

## NEXT (in order)
1. [done preview] FIELD — awaiting Hugo approval
2. CLIENT — author client script in vo_lines.py (segs: intro,read-stage,post-type,post-details,post-submit,bids-award,awarded,permits,payment,track,close ~7min). Wire client_starts using RF.build_client_tender (fv_tid/pv_tid; routes /app,/app/new,/app/job/{tid}). Record+build+audit+deliver.
3. SUPPLIER already done.
4. ADMIN ~11min: Overview/Jobs/Ground Force/Verification/Team/Notifications/Ledger.
5. 4 PDF booklets (Client first).
6. System finalize: typecheck/lint, staged-gate click-test, go-live checklist.

## ENV
- Dev: tmux srv, Vite :4200, cwd packages/web.
- Re-seed before EACH record: cd packages/web && bun --env-file=../../.env src/api/demo-seed.ts
- VO gen: PYTHONPATH=/home/user/afrigen/tutorials python3 vo_lines.py <role>
- Record: PYTHONPATH=... python3 record_synced.py <role>  (ONLY_SEG=x to test one)
- Build: python3 build_role_clips.py <role>
- Audit: python3 verify_sync.py <role>  -> inspect ALL _audit/<role>/*.png
- Logins client@/supplier@/supplier2@/field@/admin@nguzo.africa pass nguzo2026
