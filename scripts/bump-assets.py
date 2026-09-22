#!/usr/bin/env python3
"""Stamp a version marker on the shared asset references so browsers fetch fresh copies.

GitHub Pages caches /assets/* for 10 minutes and the HTML referenced them with
bare URLs, so a phone that had opened the site kept the previous stylesheet and
script after a deploy - which read as "the change did not work". The marker is a
hash of the two files, so it changes exactly when they do and never otherwise.

Run after editing assets/print-theme.css or assets/reveal.js, before committing:
    python3 scripts/bump-assets.py
"""
import os, re, subprocess
h=subprocess.run(["git","hash-object","assets/print-theme.css"],capture_output=True,text=True).stdout.strip()[:7]
j=subprocess.run(["git","hash-object","assets/reveal.js"],capture_output=True,text=True).stdout.strip()[:7]
VER=f"{h}{j}"[:10]; n=0
for dp,dn,fn in os.walk("."):
    dn[:]=[d for d in dn if d not in (".git","node_modules")]
    for f in fn:
        if not f.endswith(".html"): continue
        p=os.path.join(dp,f); s=open(p,encoding="utf-8",errors="replace").read(); o=s
        s=re.sub(r'(href="/assets/print-theme\.css)(\?v=[^"]*)?"', rf'\1?v={VER}"', s)
        s=re.sub(r'(src="/assets/reveal\.js)(\?v=[^"]*)?"', rf'\1?v={VER}"', s)
        if s!=o: open(p,"w",encoding="utf-8").write(s); n+=1
print(f"v={VER}: {n} page(s) updated")
