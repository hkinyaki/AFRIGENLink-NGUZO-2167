"""Reusable HTML components for AFRIGEN Link booklets."""

LOGO = "assets/logo.png"
LOGO_ICON = "assets/logo-icon.png"

def page(inner, cls=""):
    return f'<div class="page {cls}">{inner}</div>'

def cover(kicker, title, sub, footer_left, footer_right, hero="assets/hero.webp", badge=None):
    badge_html = f'<div class="cover-badge">{badge}</div>' if badge else ""
    return page(f'''
      <img class="hero-img" src="{hero}">
      <div class="scrim"></div>
      <div class="cover-inner">
        <div class="cover-top">
          <img src="{LOGO_ICON}">
          <div class="wm">AFRIGEN <b>Link</b></div>
        </div>
        <div class="cover-mid">
          <div class="kicker">{kicker}</div>
          <h1>{title}</h1>
          <div class="sub">{sub}</div>
          {badge_html}
        </div>
      </div>
      <div class="cover-bottom">
        <div><div class="rule"></div>{footer_left}</div>
        <div>{footer_right}</div>
      </div>
    ''', "cover")

def rhead(doc_label):
    return f'''<div class="rhead">
      <div class="l"><img src="{LOGO_ICON}"><span>AFRIGEN Link</span></div>
      <div class="r">{doc_label}</div>
    </div>'''

def rfoot(left, pg):
    return f'''<div class="rfoot"><div>{left}</div><div class="pg">{pg}</div></div>'''

def content_page(doc_label, foot_left, pg, body):
    return page(f'<div class="pad">{rhead(doc_label)}{body}{rfoot(foot_left, pg)}</div>')

def sec_head(eyebrow, title, intro=""):
    intro_h = f'<p class="intro">{intro}</p>' if intro else ""
    return f'''<div class="sec-eyebrow"><div class="bar"></div><div class="eyebrow">{eyebrow}</div></div>
      <h2 class="sec">{title}</h2>{intro_h}'''

def step(num, title, body, who=None):
    who_h = f'<span class="who">{who}</span>' if who else ""
    return f'''<div class="step"><div class="num">{num}</div>
      <div class="body"><h4>{title}</h4><p>{body}</p>{who_h}</div></div>'''

def card(icon, title, body):
    return f'<div class="card"><div class="ic">{icon}</div><h4>{title}</h4><p>{body}</p></div>'

def cards(*items):
    return '<div class="cards">' + "".join(items) + '</div>'

def callout(label, body):
    return f'<div class="callout"><div class="label">{label}</div><p>{body}</p></div>'

def note(label, body):
    return f'<div class="note"><div class="label">{label}</div><p>{body}</p></div>'

def band(img, label, title):
    return f'''<div class="band"><img src="{img}"><div class="scr"></div>
      <div class="cap"><div class="label">{label}</div><h3>{title}</h3></div></div>'''

def gate(steps):
    """steps = list of (n, short, actor)"""
    cells = ""
    for n, short, actor in steps:
        cells += f'<div class="gate-step"><div class="dot">{n}</div><div class="t">{short}</div><div class="a">{actor}</div></div>'
    return f'<div class="gate"><div class="gate-row">{cells}</div></div>'

def table(headers, rows):
    th = "".join(f"<th>{h}</th>" for h in headers)
    tr = ""
    for r in rows:
        tr += "<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>"
    return f"<table><thead><tr>{th}</tr></thead><tbody>{tr}</tbody></table>"

def chk(items):
    return '<ul class="chk">' + "".join(f"<li>{i}</li>" for i in items) + "</ul>"

def bul(items):
    return '<ul class="bul">' + "".join(f"<li>{i}</li>" for i in items) + "</ul>"

def toc(items):
    """items = list of (n, title, desc)"""
    rows = ""
    for n, t, d in items:
        rows += f'<div class="toc-item"><div class="n">{n}</div><div class="t">{t}</div><div class="d">{d}</div></div>'
    return rows

def kpis(items):
    """items = list of (value, key)"""
    cells = "".join(f'<div class="kpi"><div class="v">{v}</div><div class="k">{k}</div></div>' for v, k in items)
    return f'<div class="kpi-row">{cells}</div>'

def doc(title, *pages):
    css = open("style.css").read()
    body = "".join(pages)
    return f'''<!doctype html><html><head><meta charset="utf-8"><title>{title}</title>
    <style>{css}</style></head><body>{body}</body></html>'''
