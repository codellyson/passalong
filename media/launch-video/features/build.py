"""Writes the five feature loops (1200x750, 9s, silent) beside the launch film, from one shared look.

Each loop starts and ends on its empty ground, so it repeats without a seam on the landing.
Each loop is its own small HyperFrames project (features/<name>/) whose assets link back to the film's,
because snapshot and render read a project's index.html.
Run: python3 features/build.py  (from media/launch-video), then `npx hyperframes render` inside each folder.
"""
from pathlib import Path

HERE = Path(__file__).parent
W, H, DUR = 1200, 750, 9

CSS = """
@font-face { font-family: "Onest"; src: url("assets/fonts/onest-var.woff2") format("woff2"); font-weight: 100 900; }
@font-face { font-family: "Newsreader"; src: url("assets/fonts/newsreader-var.woff2") format("woff2"); font-weight: 200 800; }
:root { --white:#ffffff; --paper:#f1f1ef; --ink:#252522; --coral:#f2805d; --coral-text:#b8481f; --coral-soft:#fce9e0;
  --green:#3a7a2a; --amber:#e3b23c; --muted:#6e6c68; --line:#e4e3df; }
* { margin:0; padding:0; box-sizing:border-box; }
html, body { width:1200px; height:750px; overflow:hidden; background:var(--white); }
#root { position:relative; width:100%; height:100%; overflow:hidden; font-family:"Onest",sans-serif; color:var(--ink); }
.layer { position:absolute; inset:0; }
.abs { position:absolute; }
.card { width:560px; padding:22px 28px 26px; border:5px solid var(--ink); border-radius:20px; background:var(--white);
  color:var(--ink); box-shadow:0 20px 44px rgba(37,37,34,.14); }
.card .k { display:inline-block; padding:5px 16px 7px; border-radius:10px; background:var(--kc); color:var(--kt,var(--white));
  font-size:30px; font-weight:700; }
.card .t { margin-top:12px; font-size:50px; font-weight:700; letter-spacing:-.03em; line-height:1.05; white-space:nowrap; }
.card .s { margin-top:12px; font-size:32px; font-weight:500; line-height:1.25; color:var(--muted); }
.card.hot { border-color:var(--coral-text); box-shadow:0 24px 54px rgba(184,72,31,.28); }
.email { --kc:var(--coral-text); } .bug { --kc:var(--ink); } .alert { --kc:var(--amber); --kt:var(--ink); }
.ask { --kc:var(--green); } .hub { --kc:#5a5753; }
.row { display:flex; align-items:center; gap:18px; width:640px; padding:18px 24px; border:5px solid var(--ink);
  border-radius:18px; background:var(--white); box-shadow:0 14px 30px rgba(37,37,34,.12); }
.row .k { flex-shrink:0; padding:5px 14px 7px; border-radius:10px; background:var(--kc); color:var(--kt,var(--white)); font-size:28px; font-weight:700; }
.row .t { font-size:40px; font-weight:700; letter-spacing:-.025em; white-space:nowrap; }
.pill { display:flex; align-items:center; gap:14px; padding:16px 26px; border-radius:999px; background:var(--white);
  border:4px solid var(--ink); font-size:34px; font-weight:700; white-space:nowrap; box-shadow:0 14px 30px rgba(37,37,34,.15); }
.pill i { width:22px; height:22px; border-radius:50%; background:var(--kc); }
.av { display:grid; place-items:center; border-radius:50%; background:var(--ink); color:var(--white); font-weight:700; }
.stamp { border:8px solid var(--ink); border-radius:16px; padding:8px 26px 12px; font-size:48px; font-weight:700;
  letter-spacing:-.03em; white-space:nowrap; }
.tick { display:grid; place-items:center; border-radius:50%; background:var(--green); }
.tick svg { fill:none; stroke:var(--white); stroke-width:2.8; stroke-linecap:round; stroke-linejoin:round; }
.tick path { stroke-dasharray:16; stroke-dashoffset:16; }
.caret { display:inline-block; width:.08em; height:.9em; margin-left:.05em; vertical-align:-.08em; background:var(--coral); }
"""

HELPERS = """
const tl = gsap.timeline({ paused: true });
const IN = "expo.out", OUT = "power3.in";
// A thing lands: it falls into place and squashes once.
const land = (el, at, from = { y: -700, rotation: 12 }, rot = 0) => {
  tl.fromTo(el, { ...from, opacity: 0 }, { x: 0, y: 0, rotation: rot, opacity: 1, duration: 0.6, ease: "power3.out" }, at);
};
const pop = (el, at) => tl.fromTo(el, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(2.6)" }, at);
const stamp = (el, at, rot) => {
  tl.fromTo(el, { opacity: 0, scale: 1.6, rotation: rot * 3 }, { opacity: 1, scale: 1, rotation: rot, duration: 0.3, ease: "power4.in" }, at);
  tl.to(el, { keyframes: [{ scaleX: 1.05, scaleY: 0.93, duration: 0.06 }, { scaleX: 1, scaleY: 1, duration: 0.22, ease: "back.out(3)" }] }, at + 0.3);
};
const type = (el, text, at, dur) => {
  const p = { n: 0 };
  tl.fromTo(p, { n: 0 }, { n: text.length, duration: dur, ease: "none", onUpdate: () => {
    const n = Math.round(p.n);
    el.innerHTML = text.slice(0, n) + (n > 0 && n < text.length ? '<span class="caret"></span>' : "");
  } }, at);
};
// Every loop ends by clearing back to its empty ground, so the start of the next pass meets it.
const clear = (sel, at) => tl.to(sel, { opacity: 0, y: -24, duration: 0.5, ease: OUT, stagger: 0.03 }, at);
"""

def page(name, ground, css, body, script):
    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width={W}, height={H}" />
    <script src="assets/gsap.min.js"></script>
    <style>{CSS}
      #root {{ background: {ground}; }}
{css}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="{name}" data-start="0" data-duration="{DUR}" data-width="{W}" data-height="{H}">
      <div id="scene" class="layer clip" data-start="0" data-duration="{DUR}" data-track-index="0">
{body}
      </div>
    </div>
    <script>
{HELPERS}
{script}
      window.__timelines = window.__timelines || {{}};
      window.__timelines["{name}"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
"""

TICK = '<svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" /></svg>'

# 1 · Things come in: five sources arrive from every side and each becomes the same piece of work.
SOURCES = [
    ("hub", "Hub box", "Hub", "Pricing page typo", "-700px", "120px"),
    ("email", "Forwarded email", "Email", "Invoice missing", "1300px", "-200px"),
    ("bug", "Phone screenshot", "Phone", "Export error", "-700px", "800px"),
    ("alert", "Webhook", "Alert", "Payments are slow", "1300px", "500px"),
    ("email", "support@", "Customer", "I can’t log in", "560px", "900px"),
]
b1, s1 = [], []
b1.append('        <p class="abs head" id="head">Work</p>')
for i, (kind, src, k, t, sx, sy) in enumerate(SOURCES):
    y = 150 + i * 112
    hot = " hot" if i == 4 else ""
    b1.append(f'        <div class="abs pill {kind} src" id="p{i}" style="left: 280px; top: {y + 8}px"><i></i>{src}</div>')
    b1.append(f'        <div class="abs row {kind}{hot}" id="r{i}" style="left: 280px; top: {y}px"><span class="k">{k}</span><span class="t">{t}</span></div>')
    at = 0.4 + i * 0.75
    s1.append(f'tl.fromTo("#p{i}", {{ x: "{sx}", y: "{sy}", opacity: 0 }}, {{ x: 0, y: 0, opacity: 1, duration: 0.6, ease: "power3.out" }}, {at});')
    s1.append(f'tl.to("#p{i}", {{ opacity: 0, scale: 1.1, duration: 0.2 }}, {at + 0.6});')
    s1.append(f'tl.fromTo("#r{i}", {{ opacity: 0, scaleX: 0.6 }}, {{ opacity: 1, scaleX: 1, duration: 0.45, ease: "back.out(2)", transformOrigin: "0% 50%" }}, {at + 0.6});')
s1.insert(0, 'tl.fromTo("#head", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5, ease: IN }, 0.1);')
s1.append('tl.to("#r4", { keyframes: [{ x: 10, duration: 0.06 }, { x: -8, duration: 0.06 }, { x: 0, duration: 0.08 }] }, 4.8);')
s1.append('clear(["#r0", "#r1", "#r2", "#r3", "#r4", "#head"], 8.2);')
css1 = """      .head { left: 280px; top: 50px; width: 640px; padding-bottom: 14px; border-bottom: 7px solid var(--ink);
        font-size: 52px; font-weight: 700; letter-spacing: -.04em; }"""

# 2 · Passalong's agent sorts it: a messy email becomes a titled card, stamped to a team and project, with what to check.
b2 = """        <div class="abs raw" id="raw">
          <p class="raw-k">From kemi@… · 09:12</p>
          <p class="raw-b serif">hey since yesterday i cant get into my account, the reset link says expired?? pls help</p>
          <span class="abs scan" id="scan"></span>
        </div>
        <div class="abs card email hot" id="sorted" style="left: 560px; top: 150px">
          <p class="k">Email · Kemi</p><p class="t">Can’t log in</p>
          <p class="s">Reset links expire too fast, so Kemi is locked out.</p>
        </div>
        <p class="abs stamp" id="team" style="left: 820px; top: 470px">Accounts</p>
        <p class="abs chip" id="proj" style="left: 560px; top: 490px"><i></i>Web app</p>
        <div class="abs check" id="check"><b>Worth checking</b> Same as Tunde’s QA report?</div>"""
s2 = """tl.fromTo("#raw", { x: -700, rotation: -10, opacity: 0 }, { x: 0, rotation: -3, opacity: 1, duration: 0.7, ease: "power3.out" }, 0.3);
tl.set("#scan", { opacity: 1 }, 1.1);
tl.fromTo("#scan", { y: 0 }, { y: 330, duration: 1.0, ease: "sine.inOut" }, 1.1);
tl.to("#scan", { opacity: 0, duration: 0.2 }, 2.1);
tl.to("#raw", { x: -120, scale: 0.86, opacity: 0.55, duration: 0.6, ease: "power2.inOut" }, 2.2);
land("#sorted", 2.4, { x: -300, y: 0, rotation: -8 }, 2);
stamp("#team", 3.5, -5);
pop("#proj", 4.1);
tl.fromTo("#check", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.6, ease: "back.out(1.6)" }, 4.9);
clear(["#raw", "#sorted", "#team", "#proj", "#check"], 8.2);"""
css2 = """      .raw { left: 60px; top: 110px; width: 520px; height: 440px; padding: 30px 34px; border-radius: 18px; background: var(--white);
        box-shadow: 0 24px 50px rgba(120,40,10,.25); overflow: hidden; }
      .raw-k { font-size: 28px; font-weight: 600; color: var(--muted); }
      .raw-b { margin-top: 18px; font-family: "Newsreader", serif; font-size: 46px; line-height: 1.18; }
      .scan { left: 0; top: 20px; width: 100%; height: 6px; background: var(--coral-text); box-shadow: 0 0 30px 8px rgba(184,72,31,.35); opacity: 0; }
      .chip { display: flex; align-items: center; gap: 12px; padding: 10px 22px 12px; border-radius: 12px; background: var(--white);
        font-size: 36px; font-weight: 700; box-shadow: 0 10px 24px rgba(37,37,34,.15); }
      .chip i { width: 8px; height: 36px; border-radius: 4px; background: #2f8582; }
      .check { left: 560px; top: 620px; width: 580px; padding: 18px 24px; border-radius: 14px; background: var(--ink); color: var(--white);
        font-size: 32px; line-height: 1.25; }
      .check b { color: var(--coral); margin-right: 8px; }"""

# 3 · Projects remember the product: the project's documents fan out, an agent reads them, writes a line back, and a version is kept.
DOCS = [("What it is", 0), ("Who uses it", 1), ("Words we use", 2), ("How it’s built", 3)]
b3 = ['        <p class="abs proj" id="proj"><i></i>Web app</p>']
for name, i in DOCS:
    b3.append(f'        <div class="abs doc" id="d{i}" style="left: {70 + i * 270}px"><p class="doc-t">{name}</p><i></i><i></i><i></i>'
              + ('<p class="doc-new" id="newline"></p><span class="abs ver" id="ver">v4</span>' if i == 3 else '') + '</div>')
b3.append('        <div class="abs av agent" id="agent">AI</div>')
b3.append('        <span class="abs scan" id="scan"></span>')
b3 = "\n".join(b3)
s3 = """tl.fromTo("#proj", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.5, ease: IN }, 0.2);
["#d0", "#d1", "#d2", "#d3"].forEach((d, i) => tl.fromTo(d, { y: 500, rotation: -12 + i * 6, opacity: 0 }, { y: 0, rotation: (i - 1.5) * 3, opacity: 1, duration: 0.6, ease: "back.out(1.4)" }, 0.5 + i * 0.15));
pop("#agent", 1.6);
tl.set("#scan", { opacity: 1 }, 2.0);
tl.fromTo("#scan", { x: 0 }, { x: 1050, duration: 1.5, ease: "sine.inOut" }, 2.0);
tl.to("#scan", { opacity: 0, duration: 0.2 }, 3.5);
tl.to("#agent", { x: 830, y: -40, duration: 0.7, ease: "power3.inOut" }, 3.6);
tl.to("#d3", { y: -30, scale: 1.06, duration: 0.4, ease: "back.out(2)" }, 4.0);
type(document.getElementById("newline"), "Reset links last one hour.", 4.4, 1.2);
tl.to("#ver", { keyframes: [{ scale: 1.4, duration: 0.15 }, { scale: 1, duration: 0.3, ease: "back.out(3)" }] }, 5.8);
tl.call(() => {}, null, 5.8);
const v = { n: 4 };
tl.fromTo(v, { n: 4 }, { n: 5, duration: 0.01, onUpdate: () => (document.getElementById("ver").textContent = `v${Math.round(v.n)}`) }, 5.85);
tl.fromTo("#ver", { backgroundColor: "#252522" }, { backgroundColor: "#b8481f", duration: 0.2 }, 5.85);
clear(["#proj", "#d0", "#d1", "#d2", "#d3", "#agent"], 8.2);"""
css3 = """      .proj { left: 70px; top: 60px; display: flex; align-items: center; gap: 18px; color: var(--white);
        font-size: 56px; font-weight: 700; letter-spacing: -.04em; }
      .proj i { width: 10px; height: 56px; border-radius: 5px; background: #2f8582; }
      .doc { top: 200px; width: 250px; height: 380px; padding: 24px 22px; border-radius: 16px; background: var(--white); color: var(--ink); }
      .doc-t { font-size: 34px; font-weight: 700; letter-spacing: -.02em; line-height: 1.05; min-height: 76px; }
      .doc i { display: block; margin-top: 18px; height: 12px; border-radius: 6px; background: var(--line); }
      .doc i:nth-of-type(2) { width: 78%; } .doc i:nth-of-type(3) { width: 56%; }
      .doc-new { margin-top: 18px; font-size: 30px; font-weight: 700; color: var(--coral-text); line-height: 1.15; }
      .ver { right: 16px; bottom: 16px; padding: 4px 14px 6px; border-radius: 10px; background: var(--ink); color: var(--white);
        font-size: 28px; font-weight: 700; }
      .agent { left: 70px; top: 610px; width: 96px; height: 96px; font-size: 40px; background: var(--white); color: var(--ink); }
      .scan { left: 60px; top: 180px; width: 8px; height: 420px; border-radius: 4px; background: var(--coral);
        box-shadow: 0 0 36px 10px rgba(242,128,93,.45); opacity: 0; }"""

# 4 · Work gets done, and shown: one agent holds it, reports as it goes, asks and is answered, and hands in with proof.
b4 = f"""        <div class="abs card email hot" id="w" style="left: 60px; top: 60px; width: 600px">
          <p class="k">Email · Kemi</p><p class="t">Can’t log in</p>
          <span class="abs av" id="holder" style="right: 22px; top: 22px; width: 72px; height: 72px; font-size: 30px">AI</span>
        </div>
        <p class="abs note" id="n1"><i></i>Found it: links expire after 60s.</p>
        <div class="abs bub ask" id="q"><b>AI agent asks</b>Keep old links working?</div>
        <div class="abs bub ans" id="a"><b>Leo</b>Yes, for an hour.</div>
        <p class="abs note" id="n2"><i></i>Fixed and tested.</p>
        <div class="abs proof" id="proof"><span class="abs tick" id="tick" style="left: -30px; top: -30px; width: 84px; height: 84px">{TICK.replace('<svg', '<svg width="54" height="54"')}</span>
          <p class="proof-k">Proof · screenshot</p><p class="proof-t">Signed in with a new link</p></div>"""
s4 = """land("#w", 0.3, { y: -500, rotation: -8 }, -1);
pop("#holder", 0.9);
tl.fromTo("#n1", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.5, ease: IN }, 1.4);
tl.fromTo("#q", { opacity: 0, scale: 0.7, transformOrigin: "0% 100%" }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }, 2.3);
tl.fromTo("#a", { opacity: 0, scale: 0.7, transformOrigin: "100% 100%" }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }, 3.3);
tl.fromTo("#n2", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.5, ease: IN }, 4.3);
land("#proof", 5.1, { x: 500, y: 0, rotation: 10 }, 2);
pop("#tick", 5.6);
tl.to("#tick path", { strokeDashoffset: 0, duration: 0.35, ease: "power2.out" }, 5.75);
clear(["#w", "#n1", "#q", "#a", "#n2", "#proof"], 8.2);"""
css4 = """      .note { left: 70px; display: flex; align-items: center; gap: 16px; font-size: 38px; font-weight: 600; letter-spacing: -.02em; }
      .note i { width: 18px; height: 18px; border-radius: 50%; background: var(--coral); }
      #n1 { top: 270px; } #n2 { top: 600px; }
      .bub { padding: 18px 26px 22px; border-radius: 24px; font-size: 38px; font-weight: 600; line-height: 1.15; max-width: 520px; }
      .bub b { display: block; margin-bottom: 4px; font-size: 26px; font-weight: 700; opacity: .7; }
      .ask { left: 70px; top: 350px; background: var(--ink); color: var(--white); border-bottom-left-radius: 6px; }
      .ans { left: 420px; top: 470px; background: var(--white); border: 4px solid var(--ink); border-bottom-right-radius: 6px; }
      .proof { left: 700px; top: 150px; width: 440px; padding: 26px 30px 30px; border: 5px solid var(--green); border-radius: 20px;
        background: var(--white); box-shadow: 0 24px 50px rgba(58,122,42,.2); }
      .proof-k { padding-left: 44px; font-size: 28px; font-weight: 700; color: var(--green); }
      .proof-t { margin-top: 8px; font-size: 44px; font-weight: 700; letter-spacing: -.025em; line-height: 1.08; }"""

# 5 · Customers get one conversation: one thread with a tracking number, a waiting flag, a drafted reply a person sends.
b5 = """        <div class="abs thread" id="thread">
          <div class="th-h"><span class="th-name">Kemi</span><span class="th-ref">R-K7Q2M9</span><span class="flag" id="flag">Waiting 4h</span></div>
          <p class="msg them" id="m1">I can’t log in.</p>
          <p class="msg us" id="m2">We’ve got it. Your number is R‑K7Q2M9.</p>
          <p class="msg them" id="m3">Any news?</p>
          <p class="msg us sent" id="m4">Fixed. Try the reset link again now.</p>
        </div>
        <div class="abs draft" id="draft">
          <p class="draft-k">Drafted by the agent · for you to send</p>
          <p class="draft-b">Fixed. Try the reset link again now.</p>
          <p class="abs send" id="send">Send</p>
        </div>
        <svg class="abs cursor" id="cursor" viewBox="0 0 24 24"><path d="M4 2 L4 20 L9 15 L12.5 22 L15.5 20.6 L12 13.8 L19 13.8 Z" /></svg>"""
s5 = """tl.fromTo("#thread", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.6, ease: IN }, 0.2);
["#m1", "#m2", "#m3"].forEach((m, i) => tl.fromTo(m, { opacity: 0, y: 30, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: "back.out(2)" }, 0.7 + i * 0.8));
pop("#flag", 2.9);
tl.fromTo("#flag", { boxShadow: "0 0 0 0 rgba(184,72,31,.6)" }, { boxShadow: "0 0 0 18px rgba(184,72,31,0)", duration: 0.9, repeat: 1 }, 3.2);
land("#draft", 3.9, { x: 0, y: 400, rotation: 4 }, -1.5);
tl.fromTo("#cursor", { x: 0, y: 0 }, { x: -260, y: -170, duration: 0.7, ease: "power3.inOut" }, 4.8);
tl.to("#cursor", { keyframes: [{ scale: 0.85, duration: 0.08 }, { scale: 1, duration: 0.2 }] }, 5.5);
tl.to("#send", { keyframes: [{ scale: 0.9, duration: 0.08 }, { scale: 1, duration: 0.25, ease: "back.out(3)" }] }, 5.5);
tl.to("#draft", { y: 400, opacity: 0, duration: 0.5, ease: OUT }, 5.9);
tl.to("#cursor", { opacity: 0, duration: 0.3 }, 5.9);
tl.fromTo("#m4", { opacity: 0, y: 40, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "back.out(2)" }, 6.2);
tl.to("#flag", { scale: 0, opacity: 0, duration: 0.3, ease: OUT }, 6.4);
clear(["#thread"], 8.2);"""
css5 = """      .thread { left: 70px; top: 50px; width: 1060px; height: 650px; padding: 28px 34px; border: 5px solid var(--ink); border-radius: 26px;
        background: var(--white); box-shadow: 0 24px 50px rgba(37,37,34,.12); }
      .th-h { display: flex; align-items: center; gap: 20px; padding-bottom: 20px; border-bottom: 3px solid var(--line); }
      .th-name { font-size: 48px; font-weight: 700; letter-spacing: -.035em; }
      .th-ref { padding: 4px 14px 6px; border-radius: 10px; background: var(--coral-soft); color: var(--coral-text); font-size: 30px; font-weight: 700; }
      .flag { margin-left: auto; padding: 6px 18px 8px; border-radius: 10px; background: var(--coral-text); color: var(--white); font-size: 30px; font-weight: 700; }
      .msg { width: fit-content; max-width: 720px; margin-top: 18px; padding: 16px 24px 18px; border-radius: 22px; font-size: 38px; font-weight: 600; line-height: 1.15; }
      .them { background: var(--paper); border-bottom-left-radius: 6px; }
      .us { margin-left: auto; background: var(--ink); color: var(--white); border-bottom-right-radius: 6px; }
      .sent { background: var(--coral-text); }
      .draft { left: 260px; top: 380px; width: 820px; padding: 26px 32px 30px; border: 5px solid var(--ink); border-radius: 22px;
        background: var(--white); box-shadow: 0 30px 60px rgba(37,37,34,.25); }
      .draft-k { font-size: 28px; font-weight: 600; color: var(--muted); }
      .draft-b { margin-top: 10px; width: 520px; font-size: 44px; font-weight: 700; letter-spacing: -.03em; line-height: 1.1; }
      .send { right: 30px; bottom: 30px; padding: 18px 50px 22px; border-radius: 16px; background: var(--ink); color: var(--white); font-size: 44px; font-weight: 700; }
      .cursor { left: 1180px; top: 760px; width: 90px; height: 90px; fill: var(--ink); stroke: var(--white); stroke-width: 1.2; }"""

CLIPS = [
    ("things-come-in", "var(--paper)", css1, "\n".join(b1), "\n".join(s1)),
    ("agent-sorts-it", "var(--coral)", css2, b2, s2),
    ("projects-remember", "var(--ink)", css3, b3, s3),
    ("work-done-shown", "var(--coral-soft)", css4, b4, s4),
    ("one-conversation", "var(--paper)", css5, b5, s5),
]
import json
for name, ground, css, body, script in CLIPS:
    d = HERE / name
    d.mkdir(exist_ok=True)
    (d / "index.html").write_text(page(name, ground, css, body, script))
    if not (d / "assets").exists():
        (d / "assets").symlink_to("../../assets")
    for f in ("hyperframes.json", "package.json"):
        (d / f).write_text((HERE.parent / f).read_text().replace("launch-video", name))
    (d / "meta.json").write_text(json.dumps({"id": name, "name": name}, indent=2) + "\n")
    print("wrote", name)
