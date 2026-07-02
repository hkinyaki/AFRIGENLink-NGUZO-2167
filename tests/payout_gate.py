#!/usr/bin/env python3
"""Prove the payout release gate rejects: no TT proof, wrong PIN, wrong TOTP.
(Does NOT release — negatives only, so demo data is preserved.)"""
import subprocess, requests, json
from playwright.sync_api import sync_playwright

BASE="http://localhost:4200"; WEBDIR="/home/user/afrigen/packages/web"
CHROME="/usr/bin/google-chrome-stable"; PW="afrigen2026"; PIN="123456"
SEC="MShSkQsasCrTDfXZpnazrAmEN5Gvp-OS"
def totp(s): return subprocess.check_output(["bun","_otp_helper.ts",s],cwd=WEBDIR).decode().strip()

with sync_playwright() as p:
    b=p.chromium.launch(executable_path=CHROME,headless=True,args=["--no-sandbox"])
    ctx=b.new_context(base_url=BASE); page=ctx.new_page()
    page.goto(f"{BASE}/app",wait_until="networkidle",timeout=30000)
    page.fill("input[placeholder*='you@company']","admin@afrigen.link")
    page.fill("input[type=password]",PW); page.click("button[type=submit]"); page.wait_for_timeout(3500)
    if "TWO-STEP" in page.inner_text("body").upper():
        page.fill("input[placeholder='000000']", totp(SEC)); page.click("button:has-text('Verify')"); page.wait_for_timeout(4000)
    token=page.evaluate("() => localStorage.getItem('bearer_token')")
    b.close()

H={"Authorization":f"Bearer {token}"}
cs=requests.get(f"{BASE}/api/contracts",headers=H).json()["contracts"]
pend=[c for c in cs if c["payoutStatus"]=="PendingAdminApproval"]
print("PendingAdminApproval:",len(pend))
cid=pend[0]["id"]
PASS,FAIL=0,0
def chk(n,cond,d=""):
    global PASS,FAIL
    ok=cond; PASS+=ok; FAIL+=(not ok)
    print(f"  [{'PASS' if ok else 'FAIL'}] {n}"+("" if ok else f" — {d}"))

r=requests.post(f"{BASE}/api/contracts/{cid}/approve-release",headers=H,json={"pin":PIN,"totp":totp(SEC)})
chk("no TT proof -> 400", r.status_code==400, f"{r.status_code} {r.text[:80]}")
r=requests.post(f"{BASE}/api/contracts/{cid}/approve-release",headers=H,json={"payoutProofKey":"tt.png","pin":"000000","totp":totp(SEC)})
chk("wrong PIN -> 401", r.status_code==401, f"{r.status_code} {r.text[:80]}")
r=requests.post(f"{BASE}/api/contracts/{cid}/approve-release",headers=H,json={"payoutProofKey":"tt.png","pin":PIN,"totp":"000000"})
chk("wrong TOTP -> 401", r.status_code==401, f"{r.status_code} {r.text[:80]}")
print(f"\nPAYOUT GATE: {PASS} pass / {FAIL} fail")
