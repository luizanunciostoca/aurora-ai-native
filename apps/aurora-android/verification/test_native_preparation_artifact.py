"""Synthetic negative/positive packaging fixtures. Not real JNI or model tests."""

import struct
import tempfile
import unittest
import warnings
import zipfile
from pathlib import Path

import native_preparation_artifact as verifier


SOURCE = "a" * 40
CONFIG = {
    "AURORA_NATIVE_INFERENCE_ENABLED": False,
    "AURORA_NATIVE_COMPONENT_PACKAGED": True,
    "AURORA_ANDROID_SHA": SOURCE,
    "AURORA_SIGNING_PROFILE": "DEBUG_FALLBACK",
    "AURORA_ENVIRONMENT": "LOCAL",
    "AURORA_HOST_SHA": "UNBOUND_NATIVE_PREPARATION",
    "AURORA_RELEASE_TUPLE_ID": "NATIVE_PREPARATION_NO_PHYSICAL_TUPLE",
}


def uleb(value):
    result = bytearray()
    while True:
        part, value = value & 127, value >> 7
        result.append(part | (128 if value else 0))
        if not value:
            return bytes(result)


def dex_fixture(config):
    fields = sorted(config)
    types = [verifier.BUILD_CONFIG, "Z", "Ljava/lang/String;"]
    strings = sorted(set(types + fields + [value for value in config.values() if isinstance(value, str)]))
    string_off = 112
    type_off = string_off + len(strings) * 4
    field_off = type_off + len(types) * 4
    class_off = field_off + len(fields) * 8
    data = bytearray(class_off + 32)
    for index, value in enumerate(strings):
        struct.pack_into("<I", data, string_off + index * 4, len(data))
        data.extend(uleb(len(value)) + value.encode() + b"\0")
    for index, value in enumerate(types):
        struct.pack_into("<I", data, type_off + index * 4, strings.index(value))
    for index, name in enumerate(fields):
        struct.pack_into("<HHI", data, field_off + index * 8, 0, 1 if type(config[name]) is bool else 2, strings.index(name))
    class_data = len(data)
    data.extend(uleb(len(fields)) + b"\0\0\0")
    for index in range(len(fields)):
        data.extend(uleb(0 if index == 0 else 1) + uleb(0x19))
    static_values = len(data)
    data.extend(uleb(len(fields)))
    for name in fields:
        value = config[name]
        if type(value) is bool:
            data.append(0x3F if value else 0x1F)
        else:
            data.extend(bytes((0x17, strings.index(value))))
    data[:8] = b"dex\n039\0"
    struct.pack_into("<III", data, 32, len(data), 112, 0x12345678)
    struct.pack_into("<II", data, 56, len(strings), string_off)
    struct.pack_into("<II", data, 64, len(types), type_off)
    struct.pack_into("<II", data, 80, len(fields), field_off)
    struct.pack_into("<II", data, 96, 1, class_off)
    struct.pack_into("<8I", data, class_off, 0, 0x11, 0, 0, 0, 0, class_data, static_values)
    return bytes(data)


def elf_fixture(machine=183, alignment=16384):
    data = bytearray(120)
    data[:6] = b"\x7fELF\x02\x01"
    struct.pack_into("<HH", data, 16, 3, machine)
    struct.pack_into("<Q", data, 32, 64)
    struct.pack_into("<HH", data, 54, 56, 1)
    struct.pack_into("<II6Q", data, 64, 1, 5, 0, 0, 0, len(data), len(data), alignment)
    return bytes(data)


class NativePreparationArtifactTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.apk = Path(self.temp.name) / "fixture.apk"

    def package(self, config=None, extra=None, missing=None, elf=None):
        entries = {
            "classes.dex": dex_fixture(CONFIG if config is None else config),
            "assets/aurora-native/LLAMA_LICENSE.txt": b"license fixture",
            **{name: elf or elf_fixture() for name in verifier.LIBRARY_NAMES},
        }
        entries.update(extra or {})
        entries.pop(missing, None)
        with zipfile.ZipFile(self.apk, "w") as archive:
            for name, content in entries.items():
                archive.writestr(name, content)
        return self.apk

    def test_reads_compiled_flags_and_exact_source_from_dex(self):
        result = verifier.inspect_apk(self.package(), SOURCE)
        self.assertIs(result["compiled_build_config"]["AURORA_NATIVE_INFERENCE_ENABLED"], False)
        self.assertEqual(len(result["native_libraries"]), 2)

    def test_rejects_enabled_flag(self):
        with self.assertRaisesRegex(ValueError, "AURORA_NATIVE_INFERENCE_ENABLED"):
            verifier.inspect_apk(self.package({**CONFIG, "AURORA_NATIVE_INFERENCE_ENABLED": True}), SOURCE)

    def test_rejects_unpackaged_flag(self):
        with self.assertRaisesRegex(ValueError, "AURORA_NATIVE_COMPONENT_PACKAGED"):
            verifier.inspect_apk(self.package({**CONFIG, "AURORA_NATIVE_COMPONENT_PACKAGED": False}), SOURCE)

    def test_rejects_missing_flag(self):
        config = dict(CONFIG)
        del config["AURORA_NATIVE_INFERENCE_ENABLED"]
        with self.assertRaisesRegex(ValueError, "AURORA_NATIVE_INFERENCE_ENABLED"):
            verifier.inspect_apk(self.package(config), SOURCE)

    def test_rejects_wrong_head_or_signing_profile(self):
        for name, value in (("AURORA_ANDROID_SHA", "b" * 40), ("AURORA_SIGNING_PROFILE", "PHYSICAL_DEV_STABLE")):
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, name):
                verifier.inspect_apk(self.package({**CONFIG, name: value}), SOURCE)

    def test_rejects_model_extension_and_renamed_magic(self):
        for name, value in (("assets/model.gguf", b"x"), ("assets/data.bin", b"GGUFmore")):
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, "model must not be packaged"):
                verifier.inspect_apk(self.package(extra={name: value}), SOURCE)

    def test_rejects_unexpected_abi_and_missing_library(self):
        with self.assertRaisesRegex(ValueError, "native libraries or ABI"):
            verifier.inspect_apk(self.package(extra={"lib/x86_64/libaurora_llama.so": elf_fixture()}), SOURCE)
        with self.assertRaisesRegex(ValueError, "native libraries or ABI"):
            verifier.inspect_apk(self.package(missing="lib/arm64-v8a/libaurora_llama.so"), SOURCE)

    def test_rejects_missing_license(self):
        with self.assertRaisesRegex(ValueError, "license"):
            verifier.inspect_apk(self.package(missing="assets/aurora-native/LLAMA_LICENSE.txt"), SOURCE)

    def test_rejects_wrong_machine_and_4k_alignment(self):
        for content in (elf_fixture(machine=62), elf_fixture(alignment=4096)):
            with self.subTest(content=content[:20]), self.assertRaises(ValueError):
                verifier.inspect_apk(self.package(elf=content), SOURCE)

    def test_rejects_duplicate_entries_and_duplicate_build_config(self):
        self.package()
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            with zipfile.ZipFile(self.apk, "a") as archive:
                archive.writestr("classes.dex", dex_fixture(CONFIG))
        with self.assertRaisesRegex(ValueError, "duplicate APK"):
            verifier.inspect_apk(self.apk, SOURCE)
        with self.assertRaisesRegex(ValueError, "exactly one compiled BuildConfig"):
            verifier.inspect_apk(self.package(extra={"classes10.dex": dex_fixture(CONFIG)}), SOURCE)

    def test_rejects_truncated_dex_and_elf(self):
        with self.assertRaises(ValueError):
            verifier.dex_build_config(dex_fixture(CONFIG)[:-1])
        with self.assertRaises(ValueError):
            verifier.inspect_elf(elf_fixture()[:-1])

    def test_rejects_overflowing_uleb(self):
        for data in (b"\x80" * 5, b"\xff" * 5):
            with self.assertRaises(ValueError):
                verifier.uleb(data, 0)

    def test_accepts_only_the_exact_stable_ndk_revision(self):
        properties = "Pkg.Desc = Android NDK\r\nPkg.Revision = 30.0.16248370\r\n"
        self.assertEqual(verifier.inspect_ndk_revision(properties), "30.0.16248370")
        for revision in ("29.0.13113456-beta1", "29.0.14206865", "30.0.16248370-beta1",
                         "30.0.16248370-rc1", "30.0.16248371", "30.0", ""):
            with self.subTest(revision=revision), self.assertRaisesRegex(ValueError, "NDK package revision"):
                verifier.inspect_ndk_revision("Pkg.Revision = " + revision + "\n")

    def test_rejects_missing_and_ambiguous_ndk_revisions(self):
        for properties in ("Pkg.Desc = Android NDK\n",
                           "Pkg.Revision = 30.0.16248370\nPkg.Revision = 30.0.16248370\n",
                           "Pkg.Revision = 30.0.16248370\nPkg.Revision = 30.0.16248370-beta1\n"):
            with self.subTest(properties=properties), self.assertRaisesRegex(ValueError, "NDK package revision"):
                verifier.inspect_ndk_revision(properties)

    def test_rejects_missing_or_skipped_native_test_suites(self):
        directory = Path(self.temp.name)
        with self.assertRaisesRegex(ValueError, "NO_JOBS"):
            verifier.inspect_unit_reports(directory)
        for name in ("NativeModelVerifierTest", "NativeInferenceRuntimeTest", "JniNativeTextEngineTest"):
            (directory / ("TEST-" + name + ".xml")).write_text(
                f'<testsuite name="ai.aurora.device.inference.{name}" tests="1" failures="0" errors="0" skipped="0"><testcase name="fixture"/></testsuite>',
                encoding="utf-8",
            )
        self.assertEqual(len(verifier.inspect_unit_reports(directory)), 3)
        (directory / "TEST-JniNativeTextEngineTest.xml").write_text(
            '<testsuite name="ai.aurora.device.inference.JniNativeTextEngineTest" tests="1" skipped="1"><testcase name="fixture"><skipped/></testcase></testsuite>',
            encoding="utf-8",
        )
        with self.assertRaisesRegex(ValueError, "failed or skipped"):
            verifier.inspect_unit_reports(directory)


if __name__ == "__main__":
    unittest.main()
