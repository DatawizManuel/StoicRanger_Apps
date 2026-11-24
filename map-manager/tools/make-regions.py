#!/usr/bin/env python3
"""Makes lib/regions.js (countries and their regions with bounding boxes) from Natural Earth (public domain).
Usage: python3 -I tools/make-regions.py <ne_10m_admin_0_countries.geojson> <ne_10m_admin_1_states_provinces.geojson> lib/regions.js
Source: https://github.com/nvkelso/natural-earth-vector (geojson/). Regions: Natural Earth admin-1; where a country has
very many small units they are joined into their larger regions (e.g. Italian provinces → regions, UK → England,
Scotland, Wales, Northern Ireland). The ids of Map Manager 0.1.0 are kept, so maps already downloaded still match."""
import json, math, re, sys, unicodedata

a0, a1, out = sys.argv[1:4]
LEGACY_COUNTRY = {"AT": "austria", "CH": "switzerland", "LI": "liechtenstein", "SI": "slovenia", "CZ": "czechia", "SK": "slovakia", "HU": "hungary", "HR": "croatia", "DE": "germany"}
LEGACY_REGIONS = [  # 0.1.0 entries that are not the same as a generated one: kept as extra rows of their country
    ("DE", "de-bw", "Baden-Württemberg", [7.51, 47.53, 10.50, 49.80]),
    ("IT", "it-suedtirol", "South Tyrol (Bolzano)", [10.38, 46.22, 12.48, 47.10]),
    ("IT", "it-trentino", "Trentino", [10.45, 45.67, 11.97, 46.54]),
    ("IT", "it-friuli", "Friuli-Venezia Giulia", [12.32, 45.58, 13.92, 46.65]),
    ("IT", "it-veneto", "Veneto", [10.62, 44.79, 13.10, 46.68]),
    ("IT", "it-lombardia", "Lombardy", [8.49, 44.68, 11.43, 46.64]),
]
LEGACY_NAMES = {"at-tirol": "Tyrol (North and East)"}
KEEP_UNITS = {"USA", "CAN", "AUS", "BRA", "MEX", "RUS", "IND", "CHN", "ARG"}   # states/provinces are the useful level there
BY_GEONUNIT = {"GBR"}                                                        # England, Scotland, Wales, Northern Ireland

def slug(s):
    s = s.replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("Ä", "Ae").replace("Ö", "Oe").replace("Ü", "Ue").replace("ß", "ss")
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

def polys(g):
    if not g: return []
    if g["type"] == "Polygon": return [g["coordinates"]]
    if g["type"] == "MultiPolygon": return g["coordinates"]
    return []

def pbox(p):
    xs = [c[0] for c in p[0]]; ys = [c[1] for c in p[0]]
    return [min(xs), min(ys), max(xs), max(ys)]

def bbox(geoms):
    boxes = [pbox(p) for g in geoms for p in polys(g)]
    if not boxes: return None
    b = [min(x[0] for x in boxes), min(x[1] for x in boxes), max(x[2] for x in boxes), max(x[3] for x in boxes)]
    if b[2] - b[0] > 180:   # crosses the 180° meridian: keep the side with more land (an extract box cannot wrap)
        area = lambda bs: sum((x[2] - x[0]) * (x[3] - x[1]) * math.cos(math.radians((x[1] + x[3]) / 2)) for x in bs)
        w = [x for x in boxes if (x[0] + x[2]) / 2 < 0]; e = [x for x in boxes if (x[0] + x[2]) / 2 >= 0]
        side = w if area(w) >= area(e) else e
        b = [min(x[0] for x in side), min(x[1] for x in side), max(x[2] for x in side), max(x[3] for x in side)]
    f = lambda v: math.floor(v * 100) / 100; c = lambda v: math.ceil(v * 100) / 100
    return [max(-180, f(b[0])), max(-85, f(b[1])), min(180, c(b[2])), min(85, c(b[3]))]

countries = {}
for ft in json.load(open(a0))["features"]:
    p = ft["properties"]
    iso = p.get("ISO_A2_EH") or p.get("ISO_A2")
    if not iso or iso == "-99" or p.get("CONTINENT") == "Antarctica": continue
    b = bbox([ft["geometry"]])
    if not b: continue
    name = p.get("NAME_EN") or p.get("NAME")
    countries[p["ADM0_A3"]] = {"iso": iso, "name": name, "continent": p.get("CONTINENT"), "bbox": b, "units": []}
for ft in json.load(open(a1))["features"]:
    p = ft["properties"]
    c = countries.get(p.get("adm0_a3"))
    if c: c["units"].append((p, ft["geometry"]))

out_rows = []; ids = set()
def add(row):
    if row["id"] in ids: row["id"] += "-" + slug(row["country"]) if not row["id"].endswith(slug(row["country"])) else "-2"
    ids.add(row["id"]); out_rows.append(row)

for a3, c in sorted(countries.items(), key=lambda kv: kv[1]["name"]):
    cid = LEGACY_COUNTRY.get(c["iso"], slug(c["name"]))
    add({"id": cid, "name": c["name"], "country": c["name"], "cc": c["iso"], "continent": c["continent"], "kind": "country", "bbox": c["bbox"]})
    units = c["units"]
    if len(units) < 2: continue
    groups = {}
    if a3 in BY_GEONUNIT: key = lambda p: p.get("geonunit")
    elif len(units) > 45 and a3 not in KEEP_UNITS and len({p.get("region") for p, g in units if p.get("region")}) >= 3: key = lambda p: p.get("region") or (p.get("name_en") or p.get("name"))
    else: key = lambda p: p.get("name_en") or p.get("name")
    idsrc = {}
    for p, g in units:
        k = key(p)
        if not k: continue
        groups.setdefault(k, []).append(g)
        # ids from the local name (0.1.0 used e.g. at-tirol, at-kaernten, de-bayern); names shown in English
        idsrc[k] = (p.get("name") or k) if key(p) == (p.get("name_en") or p.get("name")) else k
    if len(groups) < 2: continue
    pre = c["iso"].lower()
    for k in sorted(groups):
        b = bbox(groups[k])
        if not b: continue
        rid = pre + "-" + slug(idsrc.get(k, k))
        add({"id": rid, "name": LEGACY_NAMES.get(rid, k), "country": c["name"], "cc": c["iso"], "continent": c["continent"], "kind": "region", "bbox": b})
for cc, rid, name, b in LEGACY_REGIONS:
    if rid in ids: continue
    cn = next((r["country"] for r in out_rows if r["cc"] == cc and r["kind"] == "country"), cc)
    cont = next((r["continent"] for r in out_rows if r["cc"] == cc), "")
    add({"id": rid, "name": name, "country": cn, "cc": cc, "continent": cont, "kind": "region", "bbox": b})

head = '''/* Countries and their regions offered in "Add a region": bbox = [west, south, east, north] in degrees.
   Made by tools/make-regions.py from Natural Earth 1:10m admin-0 / admin-1 (public domain, naturalearthdata.com).
   kind "country" = the whole country, "region" = a state, province or region of it. Extracts take every tile that
   touches the box, so neighbouring regions join without gaps. Display name of a region: "<country> · <name>". */
'use strict';
const R = '''
js = head + json.dumps([[r["id"], r["kind"][0], r["cc"], r["continent"], r["country"], r["name"], r["bbox"]] for r in out_rows], ensure_ascii=False, separators=(",", ":")) + ''';
module.exports = R.map(([id, k, cc, continent, country, name, bbox]) => ({ id, kind: k === "c" ? "country" : "region", cc, continent, country,
  name: k === "c" ? name : country + " · " + name, short: name, group: country, bbox }));
'''
open(out, "w").write(js)
print(len([r for r in out_rows if r["kind"] == "country"]), "countries,", len([r for r in out_rows if r["kind"] == "region"]), "regions")
