#!/usr/bin/env python3
"""Fail-closed checks of an APK of the disabled, private native preparation.

This verifies packaging, not inference, an Android installation or physical acceptance.
The small DEX reader intentionally supports only BuildConfig's primitive/string constants.
"""

import argparse
import hashlib
import json
import re
import shutil
import struct
import subprocess
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path


LLAMA_SHA = "8642541b255bfb5dc39cd351a178be09013a55d6"
MODEL_SHA = "aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223"
NDK_VERSION = "30.0.16248370"
BUILD_CONFIG = "Lai/aurora/device/BuildConfig;"
LIBRARY_NAMES = {
    "lib/arm64-v8a/libaurora_llama.so",
    "lib/arm64-v8a/libc++_shared.so",
}


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def inspect_ndk_revision(properties):
    revisions = []
    for line in properties.splitlines():
        match = re.fullmatch(r"Pkg\.Revision[ \t]*=[ \t]*(.*?)[ \t]*", line)
        if match:
            revisions.append(match.group(1))
    require(revisions == [NDK_VERSION], "NDK package revision mismatch")
    return revisions[0]


def uleb(data, offset):
    result = 0
    for shift in range(0, 35, 7):
        require(offset < len(data), "truncated DEX uleb")
        value = data[offset]
        offset += 1
        result |= (value & 127) << shift
        if value < 128:
            require(result <= 0xFFFFFFFF, "overflow DEX uleb")
            return result, offset
    raise ValueError("oversized DEX uleb")


def dex_build_config(data):
    require(len(data) >= 112 and re.fullmatch(rb"dex\n0[34][0-9]\x00", data[:8]), "invalid DEX header")

    def unpack(fmt, offset):
        size = struct.calcsize(fmt)
        require(0 <= offset <= len(data) - size, "truncated DEX structure")
        return struct.unpack_from(fmt, data, offset)

    require(unpack("<I", 32)[0] == len(data), "DEX length mismatch")
    require(unpack("<I", 36)[0] == 112 and unpack("<I", 40)[0] == 0x12345678, "unsupported DEX encoding")
    string_count, string_off = unpack("<II", 56)
    type_count, type_off = unpack("<II", 64)
    field_count, field_off = unpack("<II", 80)
    class_count, class_off = unpack("<II", 96)

    def string(index):
        require(index < string_count, "invalid DEX string index")
        start = unpack("<I", string_off + index * 4)[0]
        _, start = uleb(data, start)
        end = data.find(b"\x00", start)
        require(end >= start, "unterminated DEX string")
        # Only ASCII class/field names and BuildConfig strings are requested here.
        return data[start:end].decode("utf-8", errors="strict")

    def type_name(index):
        require(index < type_count, "invalid DEX type index")
        return string(unpack("<I", type_off + index * 4)[0])

    def encoded(offset):
        require(offset < len(data), "truncated DEX value")
        header = data[offset]
        offset += 1
        kind, arg = header & 31, header >> 5
        if kind == 31:
            require(arg <= 1, "invalid DEX boolean")
            return bool(arg), offset
        if kind == 30:
            require(arg == 0, "invalid DEX null")
            return None, offset
        require(kind in (0, 2, 3, 4, 6, 23), "unsupported BuildConfig constant")
        size = arg + 1
        maximum = {0: 1, 2: 2, 3: 2, 4: 4, 6: 8, 23: 4}[kind]
        require(size <= maximum and offset + size <= len(data), "invalid DEX constant width")
        value = int.from_bytes(data[offset:offset + size], "little", signed=kind in (0, 2, 4, 6))
        return (string(value) if kind == 23 else value), offset + size

    found = None
    for index in range(class_count):
        values = unpack("<8I", class_off + index * 32)
        if type_name(values[0]) != BUILD_CONFIG:
            continue
        require(found is None, "duplicate BuildConfig")
        cursor = values[6]
        require(cursor != 0, "missing BuildConfig class data")
        static_count, cursor = uleb(data, cursor)
        for _ in range(3):
            _, cursor = uleb(data, cursor)
        fields = []
        field_index = 0
        for _ in range(static_count):
            difference, cursor = uleb(data, cursor)
            access, cursor = uleb(data, cursor)
            field_index += difference
            require(field_index < field_count and access & 8 and access & 16, "BuildConfig field not static final")
            owner, field_type, field_name = unpack("<HHI", field_off + field_index * 8)
            require(type_name(owner) == BUILD_CONFIG, "invalid BuildConfig field owner")
            fields.append((string(field_name), type_name(field_type)))
        initial = []
        if values[7]:
            initial_count, cursor = uleb(data, values[7])
            require(initial_count <= len(fields), "too many BuildConfig initializers")
            for _ in range(initial_count):
                value, cursor = encoded(cursor)
                initial.append(value)
        found = {}
        for index, (name, field_type) in enumerate(fields):
            require(name not in found, "duplicate BuildConfig field")
            value = initial[index] if index < len(initial) else (False if field_type == "Z" else None)
            if field_type == "Z":
                require(type(value) is bool, "BuildConfig boolean type mismatch")
            found[name] = value
    return found


def inspect_elf(data):
    require(len(data) >= 64 and data[:6] == b"\x7fELF\x02\x01", "library is not little-endian ELF64")
    kind, machine = struct.unpack_from("<HH", data, 16)
    require(kind == 3 and machine == 183, "library is not AArch64 ET_DYN")
    offset = struct.unpack_from("<Q", data, 32)[0]
    entry_size, count = struct.unpack_from("<HH", data, 54)
    require(entry_size == 56 and 0 < count <= 1024 and offset + count * entry_size <= len(data), "invalid ELF program table")
    loads = []
    for index in range(count):
        p_type, _, file_off, virtual, _, file_size, memory_size, alignment = struct.unpack_from("<II6Q", data, offset + index * entry_size)
        if p_type != 1:
            continue
        require(alignment >= 16384 and alignment & (alignment - 1) == 0, "ELF LOAD is not 16 KiB aligned")
        require(file_off % 16384 == virtual % 16384, "ELF LOAD offset/address alignment mismatch")
        require(file_off + file_size <= len(data) and file_size <= memory_size, "invalid ELF LOAD bounds")
        loads.append(alignment)
    require(loads, "ELF has no LOAD segments")
    return {"machine": "AArch64", "load_alignments": loads, "sha256": digest(data), "size_bytes": len(data)}


def inspect_apk(path, expected_source):
    with zipfile.ZipFile(path) as apk:
        names = apk.namelist()
        require(len(names) == len(set(names)), "duplicate APK entries")
        libraries = {name for name in names if name.startswith("lib/")}
        require(libraries == LIBRARY_NAMES, "unexpected native libraries or ABI")
        require("assets/aurora-native/LLAMA_LICENSE.txt" in names, "missing engine license")
        configs = []
        for entry in apk.infolist():
            require(not entry.filename.lower().endswith(".gguf"), "model must not be packaged")
            with apk.open(entry) as stream:
                require(stream.read(4) != b"GGUF", "renamed GGUF model must not be packaged")
            if re.fullmatch(r"classes(?:[2-9]|[1-9][0-9]+)?\.dex", entry.filename):
                config = dex_build_config(apk.read(entry))
                if config is not None:
                    configs.append(config)
        require(len(configs) == 1, "exactly one compiled BuildConfig is required")
        config = configs[0]
        required = {
            "AURORA_NATIVE_INFERENCE_ENABLED": False,
            "AURORA_NATIVE_COMPONENT_PACKAGED": True,
            "AURORA_ANDROID_SHA": expected_source,
            "AURORA_SIGNING_PROFILE": "DEBUG_FALLBACK",
            "AURORA_ENVIRONMENT": "LOCAL",
            "AURORA_HOST_SHA": "UNBOUND_NATIVE_PREPARATION",
            "AURORA_RELEASE_TUPLE_ID": "NATIVE_PREPARATION_NO_PHYSICAL_TUPLE",
        }
        for name, expected in required.items():
            require(name in config and type(config[name]) is type(expected) and config[name] == expected, "compiled BuildConfig mismatch: " + name)
        return {"compiled_build_config": required, "native_libraries": {name: inspect_elf(apk.read(name)) for name in sorted(libraries)}}


def command(*args):
    return subprocess.check_output(args, text=True, stderr=subprocess.STDOUT).strip()


def inspect_unit_reports(directory):
    expected = {
        "ai.aurora.device.inference.NativeModelVerifierTest",
        "ai.aurora.device.inference.NativeInferenceRuntimeTest",
        "ai.aurora.device.inference.JniNativeTextEngineTest",
    }
    reports = {}
    for path in sorted(directory.glob("TEST-*.xml")):
        suite = ET.parse(path).getroot()
        name = suite.attrib.get("name", "")
        if name not in expected:
            continue
        require(name not in reports, "duplicate native test suite")
        tests = int(suite.attrib.get("tests", "0"))
        require(tests > 0, "NO_JOBS: native test suite has no tests")
        require(all(int(suite.attrib.get(key, "0")) == 0 for key in ("failures", "errors", "skipped")), "native test suite failed or skipped")
        cases = suite.findall("testcase")
        require(len(cases) == tests and not any(case.find(tag) is not None for case in cases for tag in ("failure", "error", "skipped")), "native test cases failed, skipped or mismatched")
        reports[name] = {"tests": tests, "failures": 0, "errors": 0, "skipped": 0, "report_sha256": digest(path.read_bytes())}
    require(set(reports) == expected, "NO_JOBS: missing native test suite")
    return reports


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apk", required=True, type=Path)
    parser.add_argument("--source-sha", required=True)
    parser.add_argument("--sdk", required=True, type=Path)
    parser.add_argument("--llama-source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    require(re.fullmatch("[0-9a-f]{40}", args.source_sha), "source SHA must be exact")
    require(command("git", "rev-parse", "HEAD") == args.source_sha, "checkout is not exact source head")
    command("git", "diff", "--exit-code", "HEAD", "--", "apps/aurora-android", ".github/workflows/android-foundation.yml")
    require(command("git", "-C", str(args.llama_source), "rev-parse", "HEAD") == LLAMA_SHA, "engine source mismatch")
    require(not command("git", "-C", str(args.llama_source), "status", "--porcelain", "--untracked-files=all"), "engine source is dirty")
    require(0 < args.apk.stat().st_size < 256 * 1024 * 1024, "unexpected APK size")
    evidence = inspect_apk(args.apk, args.source_sha)
    native_tests = inspect_unit_reports(Path("apps/aurora-android/app/build/test-results/testLocalDebugUnitTest"))
    ndk_properties = (args.sdk / f"ndk/{NDK_VERSION}/source.properties").read_text(encoding="utf-8")
    ndk_revision = inspect_ndk_revision(ndk_properties)
    build_tools = args.sdk / "build-tools/36.0.0"
    signer = command(str(build_tools / "apksigner"), "verify", "--verbose", "--print-certs", str(args.apk))
    require(re.search(r"Signer #1 certificate SHA-256 digest: [0-9a-f]{64}", signer), "missing certificate digest")
    command(str(build_tools / "zipalign"), "-c", "-P", "16", "4", str(args.apk))
    badging = command(str(build_tools / "aapt"), "dump", "badging", str(args.apk))
    require("package: name='ai.aurora.device.local' versionCode='4' versionName='0.17.0-dev.1-local'" in badging, "r13 package/version identity changed")
    require("sdkVersion:'26'" in badging and "targetSdkVersion:'36'" in badging, "Android API contract changed")
    args.output.mkdir(parents=True, exist_ok=False)
    apk_name = "aurora-native-preparation-local-debug.apk"
    shutil.copyfile(args.apk, args.output / apk_name)
    with zipfile.ZipFile(args.apk) as apk:
        wrapper = args.output / "libaurora_llama.so"
        wrapper.write_bytes(apk.read("lib/arm64-v8a/libaurora_llama.so"))
        require(apk.read("assets/aurora-native/LLAMA_LICENSE.txt") == (args.llama_source / "LICENSE").read_bytes(), "packaged license differs from pinned engine license")
    llvm_nm = args.sdk / f"ndk/{NDK_VERSION}/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-nm"
    symbols = command(str(llvm_nm), "-D", "--defined-only", str(wrapper))
    expected_symbols = {"Java_ai_aurora_device_inference_NativeLlamaBindings_" + name for name in ("reserve", "generate", "cancel", "release")}
    observed_symbols = {line.split()[-1] for line in symbols.splitlines() if line.split() and line.split()[-1].startswith("Java_")}
    require(observed_symbols == expected_symbols, "JNI export contract mismatch")
    evidence.update({
        "schema": "AURORA_NATIVE_PREPARATION_ARTIFACT_V1",
        "observed_at_utc": datetime.now(timezone.utc).isoformat(),
        "source_sha": args.source_sha,
        "source_tree": command("git", "rev-parse", "HEAD^{tree}"),
        "llama_source_sha": LLAMA_SHA,
        "ndk": NDK_VERSION,
        "observed_ndk_package_revision": ndk_revision,
        "cmake": "3.31.6",
        "gradle": "9.4.1",
        "agp": "9.2.0",
        "java": "17",
        "apk": {"name": apk_name, "sha256": digest(args.apk.read_bytes()), "size_bytes": args.apk.stat().st_size},
        "jni_exports": sorted(observed_symbols),
        "jvm_native_boundary_tests": native_tests,
        "model": {"packaged": False, "imported": False, "required_sha256": MODEL_SHA, "required_size_bytes": 1280835840},
        "install_authorized": False,
        "runtime_bound": False,
        "physical_acceptance": "NOT_PROVEN",
        "certificate": "PREPARATION_ONLY_NOT_W15J_ACCEPTANCE",
    })
    (args.output / "BUILD_IDENTITY.json").write_text(json.dumps(evidence, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (args.output / "apksigner-verification.txt").write_text(signer + "\n", encoding="utf-8")
    (args.output / "manifest-badging.txt").write_text(badging + "\n", encoding="utf-8")
    (args.output / "jni-exports.txt").write_text(symbols + "\n", encoding="utf-8")
    manifest = "".join(f"{digest(path.read_bytes())}  {path.name}\n" for path in sorted(args.output.iterdir()) if path.is_file())
    (args.output / "SHA256SUMS.txt").write_text(manifest, encoding="utf-8")
    print(json.dumps(evidence, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
