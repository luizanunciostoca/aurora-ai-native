import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const canonicalRoots = [
  "apps",
  "services",
  "packages",
  "catalog",
  "infra",
  "evals",
];
const excludedSegments = new Set([
  "legacy-reference",
  "legacy-manus-reference",
  "reference",
  "node_modules",
  "dist",
  "build",
  ".git",
]);
const sourceExtensions = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
  ".ts",
  ".tsx",
  ".json",
  ".py",
  ".sh",
]);
const legacyDependencyPattern =
  /(?:legacy-reference|legacy-manus-reference|reference\/original-manus)/;

function walkFiles(root, { excludeLegacy = true } = {}) {
  if (!existsSync(root)) return [];
  const files = [];
  for (const entry of readdirSync(root)) {
    const fullPath = join(root, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      if (excludeLegacy && excludedSegments.has(entry)) continue;
      files.push(...walkFiles(fullPath, { excludeLegacy }));
    } else files.push(fullPath);
  }
  return files;
}

test("canonical baseline roots exist", () => {
  for (const root of canonicalRoots) {
    const path = join(repoRoot, root);
    assert.ok(existsSync(path), `missing canonical root: ${root}`);
    assert.ok(
      statSync(path).isDirectory(),
      `canonical root is not a directory: ${root}`,
    );
  }
});

test("canonical runtime source has no dependency on legacy-reference trees", () => {
  const offenders = [];
  for (const root of canonicalRoots) {
    for (const file of walkFiles(join(repoRoot, root))) {
      if (!sourceExtensions.has(extname(file))) continue;
      if (legacyDependencyPattern.test(readFileSync(file, "utf8")))
        offenders.push(relative(repoRoot, file));
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `canonical source references legacy trees: ${offenders.join(", ")}`,
  );
});

test("W00-C tooling contains no failure-masking shell operator", () => {
  const offenders = [];
  for (const root of ["tools/test", "tools/build"]) {
    for (const file of walkFiles(join(repoRoot, root), {
      excludeLegacy: false,
    })) {
      const maskingOperator = ["|", "|", " ", "true"].join("");
      if (readFileSync(file, "utf8").includes(maskingOperator))
        offenders.push(relative(repoRoot, file));
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `failure masking found in: ${offenders.join(", ")}`,
  );
});

test("legacy test/build references are audit-only and never promoted implicitly", (t) => {
  const legacyManifest = join(
    repoRoot,
    "apps/aurora-desktop/legacy-reference/face/interface/package.json",
  );
  if (!existsSync(legacyManifest))
    return t.diagnostic(
      "legacy interface manifest is absent; nothing to audit",
    );
  const manifest = JSON.parse(readFileSync(legacyManifest, "utf8"));
  const candidates = [
    manifest?.jest?.setupFilesAfterEnv?.[0]?.replace("<rootDir>/", ""),
    manifest?.build?.win?.icon,
  ].filter(Boolean);
  const missing = candidates.filter(
    (candidate) => !existsSync(join(dirname(legacyManifest), candidate)),
  );
  if (missing.length > 0)
    t.diagnostic(`LEGACY_REFERENCE_DEBT (non-blocking): ${missing.join(", ")}`);
});

test("W00-F independent acceptance worker is exact-head, isolated, read-only and non-merging", () => {
  const workflow = readFileSync(
    join(repoRoot, ".github/workflows/aurora-independent-acceptance.yml"),
    "utf8",
  );

  assert.match(workflow, /aurora:acceptance-requested/);
  assert.match(workflow, /--agent='aurora-acceptance'/);
  assert.match(workflow, /expected_head_sha/);
  assert.match(workflow, /expected_main_sha/);
  assert.match(workflow, /path: governance/);
  assert.match(workflow, /path: candidate/);
  assert.match(
    workflow,
    /node governance\/tools\/copilot\/acceptance-review-prompt\.mjs/,
  );
  assert.match(
    workflow,
    /node governance\/tools\/copilot\/validate-acceptance-output\.mjs/,
  );
  assert.match(workflow, /working-directory: governance/);
  assert.match(workflow, /test "\$live_head" = "\$expected_head"/);
  assert.match(workflow, /test "\$live_main" = "\$expected_main"/);
  assert.match(workflow, /git -C governance status --porcelain/);
  assert.match(workflow, /git -C candidate status --porcelain/);
  assert.match(workflow, /check-runs\?filter=latest&per_page=100/);
  assert.match(workflow, /for required in quality test-build security-gate/);
  assert.match(workflow, /@github\/copilot@1\.0\.82/);
  assert.match(
    workflow,
    /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/,
  );
  assert.match(
    workflow,
    /actions\/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093/,
  );
  assert.doesNotMatch(workflow, /@github\/copilot@latest/);
  assert.doesNotMatch(workflow, /actions\/(?:upload|download)-artifact@v4/);
  assert.doesNotMatch(workflow, /npm ci/);
  assert.doesNotMatch(workflow, /contents:\s*write/);
  assert.doesNotMatch(workflow, /gh\s+pr\s+merge/);
  assert.doesNotMatch(workflow, /gh\s+issue\s+close/);
  assert.doesNotMatch(workflow, /--add-label\s+['"]aurora:accepted['"]/);
});

test("W00-F acceptance output contract cannot recommend acceptance with failed gates or blockers", () => {
  const prompt = readFileSync(
    join(repoRoot, "tools/copilot/acceptance-review-prompt.mjs"),
    "utf8",
  );
  const validator = readFileSync(
    join(repoRoot, "tools/copilot/validate-acceptance-output.mjs"),
    "utf8",
  );

  assert.match(prompt, /STALE_HEAD_OR_MAIN/);
  assert.match(prompt, /Untrusted candidate checkout: \.\.\/candidate/);
  assert.match(prompt, /Do not execute candidate-controlled install hooks/);
  assert.match(prompt, /Do not push, commit, merge/);
  assert.match(prompt, /AURORA_ACCEPTANCE_RESULT=/);
  assert.match(validator, /ACCEPT_RECOMMENDED/);
  assert.match(validator, /ACCEPT_RECOMMENDED cannot contain blockers/);
  assert.match(validator, /ACCEPT_RECOMMENDED requires all Risk Gates PASS/);
  assert.match(validator, /acceptance output repository mismatch/);
  assert.match(validator, /acceptance output PR number mismatch/);
  assert.match(validator, /acceptance output exact HEAD mismatch/);
  assert.match(validator, /acceptance output main mismatch/);
  assert.match(
    validator,
    /exactly one AURORA_ACCEPTANCE_RESULT marker is required/,
  );
  assert.match(validator, /required check evidence envelope is invalid/);
  assert.match(validator, /required check .* must appear exactly once/);
});
