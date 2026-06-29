import json, urllib.request, http.cookiejar
BASE="http://localhost:4200"
cj=http.cookiejar.CookieJar()
op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
def post(path,body):
    r=urllib.request.Request(BASE+path,data=json.dumps(body).encode(),headers={"Content-Type":"application/json"})
    return json.loads(op.open(r).read())
def get(path):
    return json.loads(op.open(BASE+path).read())
# sign in via better-auth
try:
    post("/api/auth/sign-in/email",{"email":"admin@nguzo.africa","password":"nguzo2026"})
except Exception as e:
    print("login via auth path err:",e)
ts=get("/api/admin/tenders") if True else None
