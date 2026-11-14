import math, json, base64, io, os
from PIL import Image, ImageFilter, ImageOps
import numpy as np
A=os.path.dirname(os.path.abspath(__file__))
LAUREL=open(os.path.join(A,"laurel.svgfrag")).read().replace("currentColor","url(#cc-gold2)")

SHARED_DEFS='''<linearGradient id="cc-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0c4"/><stop offset=".25" stop-color="#e2c27e"/><stop offset=".5" stop-color="#a77c35"/><stop offset=".72" stop-color="#e9cf92"/><stop offset="1" stop-color="#7a5622"/></linearGradient>
<linearGradient id="cc-gold2" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#f6dfa4"/><stop offset=".5" stop-color="#b48a45"/><stop offset="1" stop-color="#fff0c4"/></linearGradient>
<radialGradient id="cc-enamel" cx="45%" cy="35%" r="70%"><stop offset="0" stop-color="#55603f"/><stop offset=".7" stop-color="#3f4630"/><stop offset="1" stop-color="#2b3021"/></radialGradient>
<radialGradient id="cc-field" cx="50%" cy="40%" r="65%"><stop offset="0" stop-color="#5a4320"/><stop offset="1" stop-color="#2e2210"/></radialGradient>
<linearGradient id="cc-ribbon" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e6dab8"/><stop offset="1" stop-color="#bfae82"/></linearGradient>
<filter id="cc-sand" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .55 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
<filter id="cc-raise" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0.8" dy="1.4" stdDeviation="1" flood-color="#140d04" flood-opacity=".75"/></filter>
<filter id="cc-shadow" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity=".35"/></filter>
<clipPath id="cc-in"><circle cx="120" cy="120" r="82"/></clipPath>'''

def star(cx,cy,r):
    return f'<path d="M{cx:.1f},{cy-r:.1f} L{cx+r*.22:.1f},{cy-r*.22:.1f} L{cx+r:.1f},{cy:.1f} L{cx+r*.22:.1f},{cy+r*.22:.1f} L{cx:.1f},{cy+r:.1f} L{cx-r*.22:.1f},{cy+r*.22:.1f} L{cx-r:.1f},{cy:.1f} L{cx-r*.22:.1f},{cy-r*.22:.1f}Z"/>'
def arc(r,a1,a2,sweep):
    p=lambda a:(120+r*math.cos(math.radians(a)),120+r*math.sin(math.radians(a)))
    x1,y1=p(a1);x2,y2=p(a2)
    return f"M{x1:.2f},{y1:.2f} A{r},{r} 0 0 {sweep} {x2:.2f},{y2:.2f}"

def metal(cut, crop=None):
    """cut: RGBA cutout. Returns webp bytes of gold relief, square."""
    im=cut
    if crop is None:
        a=np.asarray(im.getchannel('A'))>40
        ys,xs=np.where(a)
        top,bot,l,r=ys.min(),ys.max(),xs.min(),xs.max()
        H=bot-top; W=r-l
        # head centre from top 22% rows
        band=a[top:top+int(H*.22)]
        hx=np.where(band.any(0))[0]; cx=(hx.min()+hx.max())/2
        S=int(min(max(W,H*.62),H*1.0)*1.0)
        S=int(min(W*1.02, H*.95)) if W<H*.95 else int(H*.95)
        x0=int(cx-S/2); y0=int(top-S*.05)
        crop=(x0,y0,x0+S,y0+S)
    c=im.crop(crop).resize((720,720),Image.LANCZOS)
    a=np.asarray(c.getchannel('A')).astype(float)/255
    g=np.asarray(ImageOps.grayscale(c.convert('RGB'))).astype(float)/255
    blur=np.asarray(Image.fromarray((g*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(18))).astype(float)/255
    g2=np.clip(.5+(g-blur)*1.9+(blur-.55)*.7,0,1)
    h=np.asarray(Image.fromarray((g*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.5))).astype(float)/255
    gy,gx=np.gradient(h)
    emb=np.clip((-gx*0.7-gy*0.7)*6,-.35,.35)
    v=np.clip(g2+emb,0,1)
    stops=[(0,(42,29,12)),(.3,(98,70,32)),(.55,(165,126,62)),(.78,(222,190,128)),(1,(255,243,205))]
    xs=[s[0] for s in stops]
    rgb=np.stack([np.interp(v,xs,[s[1][i] for s in stops]) for i in range(3)],-1)
    out=Image.fromarray(np.dstack([rgb,a*255]).astype(np.uint8),'RGBA')
    buf=io.BytesIO(); out.save(buf,'WEBP',quality=86,method=6)
    return buf.getvalue(), out

COLUMN='''<g fill="url(#cc-gold2)" stroke="#5e4219" stroke-width=".4" filter="url(#cc-raise)" transform="translate(120,118) scale(1.05) translate(-100,-118)">
<path d="M100,46 L102.4,58.6 L112,61 L102.4,63.4 L100,76 L97.6,63.4 L88,61 L97.6,58.6 Z"/>
<rect x="74" y="80" width="52" height="8"/><path d="M78,89 H122 L117,95 H83 Z"/>
<rect x="84" y="97" width="6" height="66"/><rect x="92" y="97" width="6" height="66"/><rect x="102" y="97" width="6" height="66"/><rect x="110" y="97" width="6" height="66"/>
<rect x="80" y="165" width="40" height="5"/><rect x="74" y="171" width="52" height="7"/></g>'''

def fit_name(name):
    n=len(name)
    fs=17; ls=4.2
    while (n*(fs*.47+ls))>255 and fs>11:
        fs-=0.5; ls=max(1.6,ls-0.25)
    return fs,ls

def coin_symbol(slug,name,banner,webp_b64=None,standalone=False):
    p=slug
    fs,ls=fit_name(name.upper())
    bfs=11 if len(banner)<=14 else (9.5 if len(banner)<=19 else 8.2)
    bw=100 if len(banner)<=14 else 116
    x1=120-bw/2; x2=120+bw/2
    centre=(f'<image href="data:image/webp;base64,{webp_b64}" x="44" y="46" width="152" height="152" filter="url(#cc-raise)"/>' if webp_b64 else COLUMN)
    body=f'''<defs><path id="{p}-top" d="{arc(97,180,360,1)}"/><path id="{p}-bot" d="{arc(97,170,10,0)}"/></defs>
<g filter="url(#cc-shadow)">
<circle cx="120" cy="120" r="118" fill="url(#cc-gold)"/>
<circle cx="120" cy="120" r="117" fill="none" stroke="#5e4219" stroke-width="2.4" stroke-dasharray="0.9 1.3"/>
<circle cx="120" cy="120" r="112.5" fill="url(#cc-gold2)"/>
<circle cx="120" cy="120" r="109" fill="url(#cc-enamel)" stroke="#6b4c1e" stroke-width="1"/>
<circle cx="120" cy="120" r="86" fill="url(#cc-gold)"/>
<circle cx="120" cy="120" r="82" fill="url(#cc-field)"/>
<circle cx="120" cy="120" r="82" fill="#000" filter="url(#cc-sand)" opacity=".5"/>
</g>
<g font-family="'Barlow Condensed','Arial Narrow',sans-serif" font-weight="700" text-anchor="middle" fill="url(#cc-gold2)" stroke="#5e4219" stroke-width=".35" filter="url(#cc-raise)">
<text font-size="{fs}" letter-spacing="{ls:.2f}" dy="6"><textPath href="#{p}-top" startOffset="50%">{name.upper()}</textPath></text>
<text font-size="11.5" letter-spacing="3" dy="3"><textPath href="#{p}-bot" startOffset="50%">IMPEDIMENTUM · FIT · VIA</textPath></text>
</g>
<g fill="url(#cc-gold2)" stroke="#5e4219" stroke-width=".3" filter="url(#cc-raise)">{star(22.5,120,6)}{star(217.5,120,6)}</g>
<g clip-path="url(#cc-in)">
<g transform="translate(120,118) scale(1.42) translate(-100,-100)" fill="url(#cc-gold2)" filter="url(#cc-raise)">{LAUREL}</g>
{centre}
</g>
<g filter="url(#cc-raise)">
<path d="M{x1-12},170 L{x1+4},168 L{x1+4},186 L{x1-12},188 L{x1-6},179 Z" fill="#a8996c"/>
<path d="M{x2+12},170 L{x2-4},168 L{x2-4},186 L{x2+12},188 L{x2+6},179 Z" fill="#a8996c"/>
<path d="M{x1},166 Q120,174 {x2},166 L{x2},184 Q120,192 {x1},184 Z" fill="url(#cc-ribbon)" stroke="#8a6f3a" stroke-width=".8"/>
<text x="120" y="{179+bfs*.33:.1f}" text-anchor="middle" font-family="'Barlow Condensed','Arial Narrow',sans-serif" font-weight="700" font-size="{bfs}" letter-spacing="1.8" fill="#2b3021">{banner.upper()}</text>
</g>
<path d="{arc(115,200,250,1)}" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2" stroke-linecap="round"/>'''
    label=f"Stoic Ranger challenge coin for {name}"
    if standalone:
        return f'<svg viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="{label}"><defs>{SHARED_DEFS}</defs>{body}</svg>'
    return f'<symbol id="coin-{p}" viewBox="0 0 240 240">{body}</symbol>'
