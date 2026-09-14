# Controls: the matcher must go red on known-bad input, not only green on good.
import json, subprocess, shutil, os
M = "/tmp/draw/marks.json"
bak = json.load(open(M))
atlas = {e["id"]: e for e in json.load(open("/tmp/draw/all.json"))}

cases = [
    ("comte",   "AOP", "CONFIRMED",    "known-true PDO must confirm"),
    ("comte",   "IGP", "WRONG_SCHEME", "scheme flip must be caught"),
    ("coppa",   "AOP", "GENERIC_NAME", "bare generic must not confirm"),
    ("absinthe","AOP", "GENERIC_NAME", "bare Absinthe unprotected; Absinthe de Pontarlier GI is"),
    ("kombu",   "AOP", "ABSENT",       "name absent from register must not confirm"),
    ("wasabi",  "IGP", "ABSENT",       "second absent control"),
]
ok = True
for eid, claim, expect, why in cases:
    if eid not in atlas:
        print("SKIP", eid, "not in atlas"); continue
    json.dump({eid: claim}, open(M, "w"))
    subprocess.run(["python3", "/tmp/draw/verify/gi_match2.py"],
                   capture_output=True)
    got = json.load(open("/tmp/draw/verify/gi_verdicts2.json"))[0]["verdict"]
    mark = "PASS" if got == expect else "FAIL"
    if got != expect: ok = False
    print(f"{mark}  {eid:10s} claimed {claim:3s} -> {got:13s} (expected {expect:13s})  {why}")

json.dump(bak, open(M, "w"), ensure_ascii=False)
subprocess.run(["python3", "/tmp/draw/verify/gi_match2.py"])
print("CONTROLS", "ALL PASS" if ok else "SOME FAILED")
