"""The useful form: flag only where the atlas origin NAMES a country that
contradicts the register. Naming a region instead of a country is not an error.
"""
import json, re, unicodedata
def norm(s):
    s=unicodedata.normalize("NFD",s or "");s="".join(c for c in s if unicodedata.category(c)!="Mn")
    return re.sub(r"\s+"," ",re.sub(r"[^a-z0-9]+"," ",s.lower().replace("’","'"))).strip()

COUNTRY={"france":"France","french":"France","italy":"Italy","italie":"Italy",
 "spain":"Spain","espagne":"Spain","portugal":"Portugal","greece":"Greece","grece":"Greece",
 "germany":"Germany","allemagne":"Germany","switzerland":"Switzerland","suisse":"Switzerland",
 "united kingdom":"United Kingdom","england":"United Kingdom","angleterre":"United Kingdom",
 "scotland":"United Kingdom","ecosse":"United Kingdom","wales":"United Kingdom",
 "netherlands":"Netherlands","pays bas":"Netherlands","belgium":"Belgium","belgique":"Belgium",
 "austria":"Austria","autriche":"Austria","denmark":"Denmark","danemark":"Denmark",
 "sweden":"Sweden","suede":"Sweden","poland":"Poland","pologne":"Poland",
 "hungary":"Hungary","hongrie":"Hungary","slovenia":"Slovenia","croatia":"Croatia",
 "romania":"Romania","greece ":"Greece","ireland":"Ireland","irlande":"Ireland",
 "turkey":"Türkiye","turquie":"Türkiye","cyprus":"Cyprus","chypre":"Cyprus"}

atlas={e["id"]:e for e in json.load(open("/tmp/draw/all.json"))}
v=[o for o in json.load(open("/tmp/draw/verify/gi_verdicts2.json")) if o["verdict"]=="CONFIRMED"]

named=0; bad=[]
for o in v:
    e=atlas[o["id"]]
    txt=norm((e["origin"]["en"] or "")+" "+(e["origin"]["fr"] or ""))
    found={c for k,c in COUNTRY.items() if re.search(r"(?:^| )"+re.escape(k)+r"(?:$| )", txt)}
    if not found: continue
    named+=1
    reg={c.strip() for c in (o.get("country") or "").split(",")}
    if not (found & reg):
        bad.append({"id":o["id"],"atlas_names":sorted(found),"register":sorted(reg),
                    "origin_en":e["origin"]["en"],"register_name":o.get("register_name")})

print(f"{len(v)} register-confirmed products")
print(f"{named} name a country outright in the origin line")
print(f"{len(bad)} of those name a country the register contradicts\n")
for b in bad:
    print(f"  {b['id']:26s} atlas says {b['atlas_names']}  register says {b['register']}")
    print(f"       origin: {b['origin_en']}   registered as: {b['register_name']}")

# Control: the check must fire on a planted contradiction.
plant={"id":"__control","origin":{"en":"Somewhere in Italy","fr":""}}
txt=norm(plant["origin"]["en"])
found={c for k,c in COUNTRY.items() if re.search(r"(?:^| )"+re.escape(k)+r"(?:$| )", txt)}
print(f"\ncontrol — planted 'Somewhere in Italy' against a France registration: "
      f"{'FIRES' if found and not (found & {'France'}) else 'DOES NOT FIRE'}")
