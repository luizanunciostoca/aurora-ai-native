#!/usr/bin/env python3
import json
import sys
from datetime import datetime, timezone

if len(sys.argv) != 3:
    raise SystemExit("usage: check-bootstrap-principal-age.py <material.json> <max-age-seconds>")
path, maximum_raw = sys.argv[1:]
maximum = int(maximum_raw)
with open(path, "r", encoding="utf-8") as handle:
    material = json.load(handle)
if material.get("kind") != "W15J_LOCAL_DP5_OPERATOR_MATERIAL":
    raise SystemExit("material kind is invalid")
value = material.get("generatedAt")
if not isinstance(value, str) or not value.endswith("Z"):
    raise SystemExit("material generatedAt is invalid")
generated = datetime.fromisoformat(value[:-1] + "+00:00")
age = (datetime.now(timezone.utc) - generated).total_seconds()
if age < 0 or age >= maximum:
    print(f"W15J_BOOTSTRAP_PRINCIPAL_AGE=STALE age_seconds={int(age)} max_seconds={maximum}")
    raise SystemExit(42)
print(f"W15J_BOOTSTRAP_PRINCIPAL_AGE=PASS age_seconds={int(age)} max_seconds={maximum}")
