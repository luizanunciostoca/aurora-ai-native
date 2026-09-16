#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
umask 077

fail() {
  printf 'Aurora physical APK signing failed: %s\n' "$*" >&2
  exit 2
}

[[ "${PREFIX:-}" == "/data/data/com.termux/files/usr" ]] || fail "run inside Termux"
for cmd in proot-distro sha256sum sed grep stat cmp awk tr; do
  command -v "$cmd" >/dev/null 2>&1 || fail "$cmd is missing"
done

DEVLAB_ROOT="${AURORA_DEVLAB_ROOT:-$HOME/aurora-devlab}"
ARTIFACT_DIR="$DEVLAB_ROOT/artifacts"
PRESIGN_APK="$ARTIFACT_DIR/Aurora-W15J-Physical-presign.apk"
FINAL_APK="$ARTIFACT_DIR/Aurora-W15J-Physical-localDebug.apk"
SIGNING_IDENTITY="$ARTIFACT_DIR/FINAL_SIGNING_IDENTITY.txt"
BUILD_IDENTITY="$ARTIFACT_DIR/BUILD_IDENTITY.txt"
SIGN_DIR="${AURORA_PHYSICAL_SIGNING_DIR:-$HOME/.aurora-signing/physical-dev-v017}"
KEYSTORE="$SIGN_DIR/aurora-physical-dev.p12"
PASSWORD_FILE="$SIGN_DIR/store.pass"
ALIAS_FILE="$SIGN_DIR/alias.txt"
EXPECTED_PRESIGN_SHA="${AURORA_PRESIGN_APK_SHA256:-6aaf19c6ca64e7cfe777d4a2a3d32f8c232f96da334843ffee82449e3ae95204}"
EXPECTED_FINAL_SHA="${AURORA_APK_SHA256:-80b5baeccd6853d97af23d4cee3477a0828f35bc30ae418bed267c81dac352b6}"
EXPECTED_CERT_SHA="${AURORA_PHYSICAL_SIGNER_CERT_SHA256:-e1745e3d3940fc6b03aef0b609d43aa8c436901965966087c2366108ffe263fb}"

for path in "$PRESIGN_APK" "$BUILD_IDENTITY" "$KEYSTORE" "$PASSWORD_FILE" "$ALIAS_FILE"; do
  [[ -f "$path" && ! -L "$path" ]] || fail "required regular file missing: $path"
done
[[ "$(stat -c %a "$SIGN_DIR")" == "700" ]] || fail "signing directory must be mode 700"
[[ "$(stat -c %a "$KEYSTORE")" == "600" ]] || fail "keystore must be mode 600"
[[ "$(stat -c %a "$PASSWORD_FILE")" == "600" ]] || fail "password file must be mode 600"
[[ "$EXPECTED_PRESIGN_SHA" =~ ^[0-9a-f]{64}$ ]] || fail "pre-sign SHA must be lowercase 64-hex"
[[ "$EXPECTED_FINAL_SHA" =~ ^[0-9a-f]{64}$ ]] || fail "final SHA must be lowercase 64-hex"
[[ "$EXPECTED_CERT_SHA" =~ ^[0-9a-f]{64}$ ]] || fail "certificate SHA must be lowercase 64-hex"
[[ "$(sha256sum "$PRESIGN_APK" | awk '{print $1}')" == "$EXPECTED_PRESIGN_SHA" ]] || fail "pre-sign APK hash drift"
[[ "$(wc -l < "$BUILD_IDENTITY" | tr -d ' ')" == "24" ]] || fail "BUILD_IDENTITY must contain exactly 24 lines"
grep -Fxq 'input_signing_profile=DEBUG_FALLBACK' "$BUILD_IDENTITY" || fail "pre-sign input profile drift"
grep -Fxq 'final_signing_profile=PHYSICAL_DEV_STABLE_LOCAL' "$BUILD_IDENTITY" || fail "final signing profile drift"
grep -Fxq 'local_signing_required=true' "$BUILD_IDENTITY" || fail "local signing requirement missing"
grep -Fxq "expected_signer_cert_sha256=$EXPECTED_CERT_SHA" "$BUILD_IDENTITY" || fail "BUILD_IDENTITY signer certificate drift"

TMP_NAME=".Aurora-W15J-Physical-signed.$$.apk"
TMP_APK="$ARTIFACT_DIR/$TMP_NAME"
VERIFY="$ARTIFACT_DIR/.apksigner-verify.$$.txt"
rm -f "$TMP_APK" "$VERIFY"
trap 'rm -f -- "$TMP_APK" "$VERIFY"' EXIT

proot-distro login debian \
  --bind "$ARTIFACT_DIR:/artifact" \
  --bind "$SIGN_DIR:/signing" \
  -- bash -lc 'set -euo pipefail; ALIAS=$(cat /signing/alias.txt); PASS=$(cat /signing/store.pass); printf "%s\n%s\n" "$PASS" "$PASS" | apksigner sign --ks /signing/aurora-physical-dev.p12 --ks-type PKCS12 --ks-key-alias "$ALIAS" --ks-pass stdin --key-pass stdin --v1-signing-enabled false --v2-signing-enabled true --v3-signing-enabled true --v4-signing-enabled false --out /artifact/'"$TMP_NAME"' /artifact/Aurora-W15J-Physical-presign.apk'

DET_NAME=".Aurora-W15J-Physical-signed-determinism.$$.apk"
DET_APK="$ARTIFACT_DIR/$DET_NAME"
trap 'rm -f -- "$TMP_APK" "$DET_APK" "$VERIFY"' EXIT

proot-distro login debian \
  --bind "$ARTIFACT_DIR:/artifact" \
  --bind "$SIGN_DIR:/signing" \
  -- bash -lc 'set -euo pipefail; ALIAS=$(cat /signing/alias.txt); PASS=$(cat /signing/store.pass); printf "%s\n%s\n" "$PASS" "$PASS" | apksigner sign --ks /signing/aurora-physical-dev.p12 --ks-type PKCS12 --ks-key-alias "$ALIAS" --ks-pass stdin --key-pass stdin --v1-signing-enabled false --v2-signing-enabled true --v3-signing-enabled true --v4-signing-enabled false --out /artifact/'"$DET_NAME"' /artifact/Aurora-W15J-Physical-presign.apk'

[[ "$(sha256sum "$TMP_APK" | awk '{print $1}')" == "$EXPECTED_FINAL_SHA" ]] || fail "signed APK hash drift"
cmp -s "$TMP_APK" "$DET_APK" || fail "physical signing is not deterministic"

proot-distro login debian --bind "$ARTIFACT_DIR:/artifact" -- bash -lc \
  'apksigner verify --verbose --print-certs /artifact/'"$TMP_NAME"' > /artifact/'"$(basename "$VERIFY")"''

grep -Fxq 'Verified using v1 scheme (JAR signing): false' "$VERIFY" || fail "unexpected v1 signing state"
grep -Fxq 'Verified using v2 scheme (APK Signature Scheme v2): true' "$VERIFY" || fail "APK v2 signature missing"
grep -Fxq 'Verified using v3 scheme (APK Signature Scheme v3): true' "$VERIFY" || fail "APK v3 signature missing"
cert_sha="$(sed -n 's/^Signer #1 certificate SHA-256 digest: //p' "$VERIFY" | tr '[:upper:]' '[:lower:]')"
[[ "$cert_sha" == "$EXPECTED_CERT_SHA" ]] || fail "physical signer certificate drift"
[[ "$(grep -c '^Signer #[0-9][0-9]* certificate SHA-256 digest:' "$VERIFY")" == "1" ]] || fail "exactly one APK signer required"

mv -f "$TMP_APK" "$FINAL_APK"
rm -f "$DET_APK"
final_sha="$(sha256sum "$FINAL_APK" | awk '{print $1}')"
[[ "$final_sha" == "$EXPECTED_FINAL_SHA" ]] || fail "final APK promotion hash drift"

cat >"$SIGNING_IDENTITY" <<EOF
signing_profile=PHYSICAL_DEV_STABLE_LOCAL
presign_apk_sha256=$EXPECTED_PRESIGN_SHA
final_apk_sha256=$final_sha
signer_cert_sha256=$cert_sha
apk_signature_v1=false
apk_signature_v2=true
apk_signature_v3=true
signer_count=1
deterministic_signing=true
private_key_exported=false
EOF
chmod 600 "$FINAL_APK" "$SIGNING_IDENTITY"
trap - EXIT
rm -f "$VERIFY"

cat <<EOF
Aurora physical APK signed and verified locally.
final_apk_sha256=$final_sha
signer_cert_sha256=$cert_sha
signing_profile=PHYSICAL_DEV_STABLE_LOCAL
deterministic_signing=true
path=$FINAL_APK
EOF
