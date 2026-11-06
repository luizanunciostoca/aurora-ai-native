#!/data/data/com.termux/files/usr/bin/python
import hashlib
import pathlib
import sys

if len(sys.argv) != 2:
    raise SystemExit("usage: hash-host-prebuild.py <host-dir>")

root = pathlib.Path(sys.argv[1]).resolve()
targets = [
    root / "packages/contracts/dist",
    root / "packages/events/dist",
    root / "packages/policy/dist",
    root / "services/executors/dist",
    root / "services/mobile-gateway/dist",
]
node_modules = root / "node_modules"
lock = node_modules / ".package-lock.json"

for target in [*targets, node_modules, lock]:
    if not target.exists():
        raise SystemExit(f"missing prebuild target: {target}")

files = [lock]
for target in [*targets, node_modules]:
    files.extend(path for path in target.rglob("*") if path.is_file() or path.is_symlink())

hasher = hashlib.sha256()
for path in sorted(files, key=lambda item: item.relative_to(root).as_posix()):
    relative = path.relative_to(root).as_posix().encode()
    data = ("SYMLINK:" + str(path.readlink())).encode() if path.is_symlink() else path.read_bytes()
    hasher.update(len(relative).to_bytes(8, "big"))
    hasher.update(relative)
    hasher.update(len(data).to_bytes(8, "big"))
    hasher.update(data)
print(hasher.hexdigest())
