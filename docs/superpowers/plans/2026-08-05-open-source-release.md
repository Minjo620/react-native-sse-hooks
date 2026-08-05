# React Native SSE Hooks Open-Source Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `react-native-sse-hooks` 完善为有可复现实验证据、规范协作流程、自动质量门禁和可审计 npm 发布链路的公开开源库，并在首次 npm 发布前保留一次明确的人工确认。

**Architecture:** 代码库继续保持 Hook-first、函数式 parser/transport 和零运行时依赖。GitHub Actions 使用固定的 Ubuntu 24.04、Node 24.18.0 与 npm 11.16.0 承担 CI、Node/V8 benchmark、Changesets Release PR 和后续 OIDC 发布；Expo/Hermes/iOS production 验证继续在固定 Mac 模拟器环境完成。普通功能 PR 不直接发布，合并后由 Changesets 汇总版本与 changelog，维护者合并 Release PR 后才发布。

**Tech Stack:** TypeScript 5.9、React 17+、React Native 0.64+、Vitest 4、tsup 8、publint、Are The Types Wrong、GitHub Actions、Changesets、npm Trusted Publishing、Expo SDK 57、React Native 0.86.2、Hermes。

## Global Constraints

- 开源署名统一使用 `minjo`，不公开联系邮箱。
- GitHub 仓库固定为 `Minjo620/react-native-sse-hooks`，公开可见，默认分支为 `main`。
- npm 包固定为非 scoped 的 `react-native-sse-hooks`，首个正式版本为 `0.1.0`，不使用 beta 通道。
- CI 和本地开发统一使用 Node `24.18.0`、npm `11.16.0` 与 `npm ci`。
- `src/` 保持函数式；不引入 class、模块级连接状态、人工建联延迟或新的运行时依赖。
- 所有公开 API 使用中文 JSDoc；README 同时提供中文和英文。
- 性能声明必须注明 runtime、设备、bundle、样本量、对标版本和限制；不得声称所有引擎普遍领先。
- 普通 PR 的性能任务验证正确性并生成趋势报告，不以共享 runner 的微小计时波动阻止合并。
- `main` 禁止直接推送、force push 和删除；合并必须经过 PR 与 required CI。
- Agent 只能创建分支或 Draft PR，不能直接合并 `main` 或发布 npm。
- npm 后续发布使用 OIDC Trusted Publishing，不保存长期 npm Token。
- 首次 `0.1.0` 发布是不可逆外部动作，必须在所有验证完成后单独取得用户确认。
- 不创建自建 Agent 平台，不购买 Copilot，不接入外部消息服务。

---

### Task 1: Preserve the verified baseline and sanitize publishable content

**Files:**

- Modify: `.gitignore`
- Review: `.agents/**`, `AGENTS.md`, `README.md`, `LICENSE`, `src/**`, `tests/**`, `benchmarks/**`, `.github/**`, `package.json`, `package-lock.json`

**Interfaces:**

- Consumes: 当前无 commit、44 个测试通过的本地 SDK。
- Produces: 无敏感信息、可追溯的初始 Git commit；后续任务都从该 commit 开始。

- [ ] **Step 1: Verify that no credential-like material is tracked or publishable**

Run:

```bash
rg -n --hidden --glob '!node_modules/**' --glob '!dist/**' --glob '!coverage/**' --glob '!docs/superpowers/plans/**' '(SESSIONID=|z_c0=|__zse_ck=|captcha_ticket|BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|npm_[A-Za-z0-9]{20,}|gh[opusr]_[A-Za-z0-9]{20,})' .
```

Expected: no matches. If a match exists, stop and remove or redact it before any commit.

- [ ] **Step 2: Exclude generated release and benchmark outputs**

Add these exact entries to `.gitignore` while retaining existing ignores:

```gitignore
*.tgz
benchmark-results/
```

- [ ] **Step 3: Re-run the full baseline gate**

Run:

```bash
npm run check
```

Expected: 5 test files and 44 tests pass; production audit reports zero vulnerabilities; CJS, ESM and declarations build; publint/attw report no errors.

- [ ] **Step 4: Create the initial baseline commit on `main`, then recreate the implementation branch**

Run:

```bash
git branch -m main
git add .
git commit -m "chore: establish verified SDK baseline"
git switch -c chore/open-source-release
```

Expected: `main` points at the verified baseline and work continues on `chore/open-source-release`.

### Task 2: Pin the development and CI runtime without constraining React Native consumers

**Files:**

- Create: `.nvmrc`
- Create: `.node-version`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: Node `24.18.0`, npm `11.16.0`, existing `npm run check`.
- Produces: identical local/CI toolchain and one authoritative required check named `quality`.

- [ ] **Step 1: Add exact runtime marker files**

Create both `.nvmrc` and `.node-version` with exactly:

```text
24.18.0
```

- [ ] **Step 2: Add package-manager and repository metadata**

Update `package.json` with:

```json
{
  "author": "minjo",
  "packageManager": "npm@11.16.0",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/Minjo620/react-native-sse-hooks.git"
  },
  "bugs": {
    "url": "https://github.com/Minjo620/react-native-sse-hooks/issues"
  },
  "homepage": "https://github.com/Minjo620/react-native-sse-hooks#readme"
}
```

Do not add a restrictive `engines.node` field: Node is the build/test tool here, while consumers execute the package in React Native. Exact contributor tooling is enforced by the marker files, `packageManager`, and CI.

- [ ] **Step 3: Regenerate package-lock metadata with the pinned npm version**

Run:

```bash
npm install --package-lock-only
```

Expected: lockfile remains version 3 and root package metadata matches `package.json`.

- [ ] **Step 4: Replace the Node matrix with the agreed exact environment**

Configure `.github/workflows/ci.yml` to:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    name: quality
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 24.18.0
          cache: npm
      - run: npm install --global npm@11.16.0
      - run: npm ci
      - run: npm run check
```

- [ ] **Step 5: Verify local metadata and quality gates**

Run:

```bash
node --version
npm --version
npm run check
```

Expected: `v24.18.0`, `11.16.0`, and the full quality gate passes.

- [ ] **Step 6: Commit the runtime alignment**

```bash
git add .nvmrc .node-version package.json package-lock.json .github/workflows/ci.yml
git commit -m "ci: align local and hosted runtimes"
```

### Task 3: Archive reproducible benchmark evidence and disclose its limits

**Files:**

- Create: `docs/benchmarks/README.zh-CN.md`
- Create: `docs/benchmarks/README.md`
- Create: `docs/benchmarks/2026-08-05-results.md`
- Create: `docs/benchmarks/data/2026-08-05/final-parser-report.json`
- Create: `docs/benchmarks/data/2026-08-05/round-2-aggregate-report.json`
- Create: `docs/benchmarks/data/2026-08-05/parser-suite-1.json`
- Create: `docs/benchmarks/data/2026-08-05/parser-suite-2.json`
- Create: `docs/benchmarks/data/2026-08-05/parser-suite-3.json`
- Create: `docs/benchmarks/data/2026-08-05/simulator-prod-suite-1.json`
- Create: `docs/benchmarks/data/2026-08-05/simulator-prod-suite-2.json`
- Create: `docs/benchmarks/data/2026-08-05/simulator-prod-suite-3.json`
- Modify: `benchmarks/README.md`

**Interfaces:**

- Consumes: existing deterministic generator and source evidence under `/Users/minjo/dev/learn-app-project/.benchmark/optimization/`.
- Produces: auditable method, concise results, raw evidence and explicit non-universal claims used by README.

- [ ] **Step 1: Copy only final retained evidence**

Copy the final Node report, all three retained Round 2 Node suites, retained Round 2 aggregate, and all three retained production simulator suites into the paths above. Do not publish rejected Round 3 data as current results; describe it in prose as a rejected experiment.

- [ ] **Step 2: Document the Node/V8 method in both languages**

The method must state: same generated stream, same cumulative XHR snapshots, `react-native-sse@1.2.1`, 20 balanced AB/BA samples per implementation per suite, three suites for retained aggregate evidence, median and P95, delivered count and data equality before timing, Node `24.18.0`, and the fact that this is parser-only evidence.

- [ ] **Step 3: Document the Expo/Hermes method and environment**

Record exactly: iPhone 17 Pro simulator, iOS 26.5, Expo SDK 57.0.0, React Native 0.86.2, Hermes, Expo Go, `--no-dev --minify`, 234 connections across three suites, 189 measured connections, and hash/order/count validation.

- [ ] **Step 4: Publish the retained result table with limitations**

Include the five workloads and these retained Hermes throughput improvements versus `react-native-sse@1.2.1` configured with 0 ms initial delay: `+7.46%`, `+5.13%`, `+22.01%`, `+9.89%`, `+14.13%`. Include the Node fresh result where `normal-stream` is `0.986×` and explain the observed 1%–2% difference without calling it a universal regression.

- [ ] **Step 5: Verify raw evidence matches the written tables**

Run a read-only Node script that loads every JSON file, asserts each retained suite reports correct/hash-matching runs, and recomputes the displayed values from the aggregate files. Expected: exit 0 and no hand-copied number differs from raw evidence.

- [ ] **Step 6: Run the current benchmark fresh**

Run:

```bash
BENCHMARK_OUTPUT=benchmark-results/local-node-v8.json npm run benchmark
```

Expected: all five scenarios deliver the configured event counts for both implementations and produce a JSON report. Timing may differ from archived evidence and must not overwrite it.

- [ ] **Step 7: Commit benchmark evidence**

```bash
git add benchmarks/README.md docs/benchmarks
git commit -m "docs: publish reproducible benchmark evidence"
```

### Task 4: Add complete Chinese JSDoc without changing runtime behavior

**Files:**

- Modify: `src/types.ts`
- Modify: `src/useEventSource.ts`
- Modify: `src/parser.ts`
- Modify: `src/transport.ts`
- Modify: `src/index.ts`

**Interfaces:**

- Consumes: existing public Hook API and internal parser/transport contracts.
- Produces: Chinese API documentation and concise hot-path rationale with byte-for-byte-equivalent runtime behavior after minification aside from comments.

- [ ] **Step 1: Inventory every exported symbol**

Run:

```bash
rg -n '^export (type|interface|function|\{)' src
```

Expected inventory includes `useEventSource`, every type re-exported by `src/index.ts`, and internal parser/transport exports used by tests.

- [ ] **Step 2: Add Chinese JSDoc to public types and Hook**

Document purpose, defaults, lifecycle, callback return meaning, error/close categories, stable commands, and the transport-owned `Last-Event-ID` restriction. Do not promise browser EventSource compatibility beyond implemented behavior.

- [ ] **Step 3: Add concise implementation rationale to measured hot paths**

Explain the use of `indexOf`, scan cursor, suffix-only cumulative XHR processing, and avoiding intermediate Last-Event-ID events. State that these choices reduce rescans/temporary allocations in measured paths; do not assert Hermes/V8 will always inline or optimize a method.

- [ ] **Step 4: Verify no emitted declarations or public exports were lost**

Run:

```bash
npm run typecheck
npm run build
npm run package:check
```

Expected: exit 0; CJS, ESM, `.d.ts`, `.d.mts`, and React Native export conditions remain valid.

- [ ] **Step 5: Run full regression tests**

```bash
npm run check
```

Expected: all existing tests pass with unchanged behavior.

- [ ] **Step 6: Commit documentation-only source changes**

```bash
git add src
git commit -m "docs: add Chinese API documentation"
```

### Task 5: Replace the preview README with an objective bilingual release README

**Files:**

- Modify: `README.md`
- Create: `README.zh-CN.md`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**

- Consumes: Task 3 benchmark evidence and Task 4 public JSDoc.
- Produces: npm/GitHub landing documentation in English and Chinese with matching claims and navigation.

- [ ] **Step 1: Write the Chinese primary guide**

Include installation, minimal Hook example, lifecycle controls, retry/close policy, AppState behavior, Last-Event-ID ownership, compatibility, limitations, benchmark summary, evidence links, contribution/security links, and MIT license. Use factual comparison language and refer to `react-native-sse` as the benchmark baseline, not as an inferior library.

- [ ] **Step 2: Write the English equivalent**

Keep examples, defaults, caveats and benchmark numbers semantically identical. Put language links at the top of both files.

Add `README.zh-CN.md` to the package `files` allowlist so the language link also works for npm consumers.

- [ ] **Step 3: Cite primary sources for protocol and baseline facts**

Link to the WHATWG SSE standard and the official `binaryminds/react-native-sse` repository for the documented 500 ms default. Describe the library's benefit as removal of an artificial scheduling delay, not a claim that the network handshake itself is 500 ms faster.

- [ ] **Step 4: Remove preview wording and universal performance claims**

Delete “experimental/local development preview” language. State that results apply to the documented environments and that Node `normal-stream` was approximately 1%–2% slower in the retained parser microbenchmark.

- [ ] **Step 5: Verify code examples and links**

Extract TypeScript examples into a temporary typecheck fixture using the packed declarations; run the repository's Markdown formatter check and verify every relative link points to an existing path.

- [ ] **Step 6: Commit bilingual docs**

```bash
git add README.md README.zh-CN.md
git commit -m "docs: add bilingual package guide"
```

### Task 6: Add focused open-source governance and structured contribution intake

**Files:**

- Create: `CONTRIBUTING.md`
- Create: `SECURITY.md`
- Create: `CODE_OF_CONDUCT.md`
- Create: `CHANGELOG.md`
- Create: `.github/ISSUE_TEMPLATE/bug.yml`
- Create: `.github/ISSUE_TEMPLATE/feature.yml`
- Create: `.github/ISSUE_TEMPLATE/performance.yml`
- Create: `.github/ISSUE_TEMPLATE/config.yml`
- Create: `.github/PULL_REQUEST_TEMPLATE.md`

**Interfaces:**

- Consumes: documented support matrix, benchmark method and `npm run check`.
- Produces: actionable bug/performance/feature reports and PR acceptance criteria suitable for human or Agent execution.

- [ ] **Step 1: Write contribution and security policies**

`CONTRIBUTING.md` must require an Issue for non-trivial changes, tests at the lowest deterministic layer, `npm run check`, benchmark evidence for parser/buffering claims, and a Changeset for user-visible changes. `SECURITY.md` must direct private reports to GitHub Private Vulnerability Reporting and publish no email.

- [ ] **Step 2: Adopt the Contributor Covenant without inventing custom conduct rules**

Use Contributor Covenant 2.1 text and its official enforcement contact mechanism via repository maintainer/private reporting, without exposing a personal email.

- [ ] **Step 3: Seed the changelog**

Create `CHANGELOG.md` with an `0.1.0` section summarizing the Hook API, incremental parser, AppState resume, retry control, compatibility and validation evidence. Do not claim the package has already been published.

- [ ] **Step 4: Add three validated Issue Forms**

Bug form fields: package/RN/Expo/platform/engine versions, reproduction URL or code, expected, actual, logs, reproducibility. Performance form fields: environment, workload, event/chunk sizes, warm-up, repetitions, raw results, baseline, reproduction. Feature form fields: problem, current workaround, proposed API, compatibility impact. Forms must auto-label `triage` plus their category.

- [ ] **Step 5: Add a PR template with release and evidence checks**

Require linked Issue, behavioral summary, tests, `npm run check`, benchmark evidence when relevant, Changeset classification, documentation, and a declaration that no credentials/test cookies were committed.

- [ ] **Step 6: Validate Issue Form YAML and project formatting**

Parse every `.github/ISSUE_TEMPLATE/*.yml` with an installed YAML parser or Ruby's standard YAML loader, then run:

```bash
npm run format:check
```

Expected: every form parses and required top-level keys are present; formatting passes.

- [ ] **Step 7: Commit governance files**

```bash
git add CONTRIBUTING.md SECURITY.md CODE_OF_CONDUCT.md CHANGELOG.md .github
git commit -m "docs: add open-source contribution workflow"
```

### Task 7: Add scheduled/manual benchmark reporting on GitHub-hosted runners

**Files:**

- Create: `.github/workflows/benchmark.yml`
- Modify: `package.json`

**Interfaces:**

- Consumes: `npm run benchmark`, exact Node/npm versions, generated output path.
- Produces: weekly and manually-triggered Node/V8 trend artifacts that never publish packages or block PRs on timing noise.

- [ ] **Step 1: Add a stable machine-readable benchmark script**

Add:

```json
"benchmark:ci": "BENCHMARK_OUTPUT=benchmark-results/node-v8.json npm run benchmark"
```

- [ ] **Step 2: Create the benchmark workflow**

Use `workflow_dispatch` and `schedule` with cron `0 2 * * 1` (Monday 10:00 Asia/Shanghai). Run on `ubuntu-24.04`, install Node `24.18.0` and npm `11.16.0`, use `npm ci`, run `npm run benchmark:ci`, and upload `benchmark-results/node-v8.json` with 30-day retention.

- [ ] **Step 3: Make benchmark semantics explicit in the workflow summary**

The summary must state that GitHub shared-runner timing is trend evidence, not a merge gate or Hermes/device result. The job must fail only on command failure or delivered-data correctness failure, not on a small throughput delta.

- [ ] **Step 4: Validate workflow syntax locally**

Parse YAML, verify cron and `runs-on`, then run:

```bash
npm run benchmark:ci
```

Expected: JSON artifact exists and contains five scenarios with equal delivered counts.

- [ ] **Step 5: Commit benchmark automation**

```bash
git add package.json package-lock.json .github/workflows/benchmark.yml
git commit -m "ci: add scheduled benchmark reporting"
```

### Task 8: Add Changesets release PR automation and tokenless npm publishing

**Files:**

- Create: `.changeset/config.json`
- Create: `.changeset/README.md`
- Create: `.github/workflows/release.yml`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**

- Consumes: user-visible Changeset files from ordinary PRs, built-in `GITHUB_TOKEN`, npm OIDC after one-time Trusted Publisher configuration.
- Produces: one Release PR that accumulates version/changelog changes; merging it runs checks and publishes without a stored npm token.

- [ ] **Step 1: Add Changesets as a development dependency**

Run:

```bash
npm install --save-dev @changesets/cli
```

- [ ] **Step 2: Configure one-package public releases**

Create `.changeset/config.json` with public access, `main` base branch, patch internal dependency policy, GitHub changelog disabled to avoid extra token requirements, and no private-package publishing.

- [ ] **Step 3: Add explicit local release commands**

Add scripts:

```json
"changeset": "changeset",
"version": "changeset version",
"release": "npm run check && changeset publish"
```

- [ ] **Step 4: Create the release workflow with least privilege**

Trigger on `push` to `main` and `workflow_dispatch`. Use `ubuntu-24.04`, exact Node/npm, `npm ci`, and `changesets/action@v1`. Grant only `contents: write`, `pull-requests: write`, and `id-token: write`. Pass the built-in `${{ secrets.GITHUB_TOKEN }}` as `GITHUB_TOKEN`; do not reference `NPM_TOKEN`.

- [ ] **Step 5: Make the human release decision visible**

Configure the release PR title as `chore: release package`, assign or request review from `Minjo620` when a release PR is created, and make its body explain that merging triggers npm publication. The workflow must not publish merely because an ordinary feature PR was merged while pending Changesets still require a version PR.

- [ ] **Step 6: Validate Changesets locally without publishing**

Create a temporary patch Changeset, run `npm run version`, verify `package.json` and `CHANGELOG.md` update coherently, then restore those temporary versioning changes while retaining configuration. Run `npm run check` afterward.

- [ ] **Step 7: Validate workflow permissions and absence of npm secrets**

Parse YAML and run:

```bash
rg -n 'NPM_TOKEN|NODE_AUTH_TOKEN|_authToken' .github .changeset package.json
```

Expected: no matches. Confirm the publish job contains `id-token: write` and runs only from `main`.

- [ ] **Step 8: Commit release automation**

```bash
git add .changeset .github/workflows/release.yml package.json package-lock.json
git commit -m "ci: add reviewed npm release automation"
```

### Task 9: Verify the exact npm tarball as a consumer would receive it

**Files:**

- Create: `scripts/verify-package.mjs`
- Create: `tests/package-fixtures/esm/package.json`
- Create: `tests/package-fixtures/esm/index.mjs`
- Create: `tests/package-fixtures/cjs/package.json`
- Create: `tests/package-fixtures/cjs/index.cjs`
- Create: `tests/package-fixtures/types/package.json`
- Create: `tests/package-fixtures/types/index.ts`
- Create: `tests/package-fixtures/types/tsconfig.json`
- Modify: `package.json`

**Interfaces:**

- Consumes: built `dist`, package export map and `npm pack` output.
- Produces: repeatable proof that the packed artifact contains only approved files and loads through CJS/ESM/type entry points.

- [ ] **Step 1: Write a failing package-verification test script**

The script must run `npm pack --json`, inspect the returned file list, reject paths outside `dist/**`, `README.md`, `README.zh-CN.md`, `LICENSE`, and `package.json`, and install the resulting `.tgz` into newly-created temporary ESM and CJS consumers. Before implementation, configure `package:verify` to call the missing script and run it; expected failure is `MODULE_NOT_FOUND`.

- [ ] **Step 2: Implement the minimal verifier**

Use Node standard libraries only. The verifier must use `mkdtemp`, copy fixed fixture manifests/entry files, run `npm install --ignore-scripts <absolute-tarball>`, execute both consumers, run a TypeScript declaration fixture, and delete only its validated temporary directory plus the generated tarball in a `finally` block.

- [ ] **Step 3: Integrate verification into release gates**

Add:

```json
"package:verify": "node scripts/verify-package.mjs"
```

and append it after `package:check` in `npm run check` without causing recursive `prepublishOnly` execution.

- [ ] **Step 4: Verify RED/GREEN and mutation resistance**

Run the verifier successfully, temporarily remove `dist/index.mjs` or point the ESM export at a nonexistent file, confirm the verifier/package checks fail for the expected reason, restore the valid state, then rerun.

- [ ] **Step 5: Run the complete gate**

```bash
npm run check
```

Expected: tests, build, package lint, tarball allowlist and clean consumer installs all pass.

- [ ] **Step 6: Commit package verification**

```bash
git add scripts tests/package-fixtures package.json package-lock.json .gitignore
git commit -m "test: verify the published tarball"
```

### Task 10: Perform Expo/Hermes production verification against the tarball

**Files:**

- Modify only if required: `/Users/minjo/dev/learn-app-project/package.json`
- Create: `docs/benchmarks/2026-08-05-release-verification.md`

**Interfaces:**

- Consumes: exact `react-native-sse-hooks-0.1.0.tgz`, existing Expo SSE benchmark/test page and iOS simulator.
- Produces: release-candidate evidence that Metro, Hermes, XHR streaming and lifecycle behavior work from the packed artifact rather than a linked source tree.

- [ ] **Step 1: Generate and identify the release-candidate tarball**

Run `npm pack --json` in the SDK and record the absolute `.tgz` path and integrity output.

- [ ] **Step 2: Install the tarball in the Expo validation project**

Use `npm install <absolute-tarball-path>` in `/Users/minjo/dev/learn-app-project`; verify `npm ls react-native-sse-hooks` resolves `0.1.0` from the installed package rather than npm link or a source path.

- [ ] **Step 3: Build a production bundle and launch the iOS simulator path**

Use the existing Expo production benchmark command documented by the validation project. Verify Metro resolves the package exports, Hermes loads the bundle, and the app reaches the SSE test screen.

- [ ] **Step 4: Execute correctness and lifecycle scenarios**

Verify real stream connection, incremental message order/hash/count, manual close, reconnect, unmount cleanup, background pause, active resume and Last-Event-ID continuity. Record command output and simulator/runtime versions.

- [ ] **Step 5: Run three production benchmark suites**

Use the established workload and warm-up configuration. Reject any measured run with wrong count/order/hash. Compare against the retained evidence without promising identical timing.

- [ ] **Step 6: Restore the validation project if installation changed unrelated user state**

Keep only the intended tarball dependency if the project is the permanent sample; otherwise restore its package manifest/lockfile without destructive Git commands. Do not modify unrelated files.

- [ ] **Step 7: Write and commit the release verification record**

Record exact commands, environment, tarball integrity, passed scenarios, measured results and limitations in `docs/benchmarks/2026-08-05-release-verification.md`, then commit it.

### Task 11: Create the public GitHub repository and enforce collaboration rules

**Files:**

- No new local source files expected.
- Remote settings: repository, labels, ruleset, Actions permissions, Issues, Private Vulnerability Reporting.

**Interfaces:**

- Consumes: verified local history on `chore/open-source-release`, authenticated `gh` account `Minjo620`.
- Produces: public `Minjo620/react-native-sse-hooks`, protected `main`, structured Issues and working CI.

- [ ] **Step 1: Perform the final pre-publication secret and package-content scan**

Re-run the Task 1 credential scan, `npm run check`, `npm run benchmark`, and `npm run package:verify`. Stop on any failure.

- [ ] **Step 2: Create the empty public repository without auto-generated files**

Run:

```bash
gh repo create Minjo620/react-native-sse-hooks --public --description "Rigorous React Native Server-Sent Events hooks with incremental parsing and explicit lifecycle control." --source . --remote origin
```

Expected: remote URL exactly `https://github.com/Minjo620/react-native-sse-hooks.git`.

- [ ] **Step 3: Push baseline main and implementation branch**

Push `main`, then `chore/open-source-release`, and open a PR from the implementation branch. Do not push implementation commits directly onto remote `main`.

- [ ] **Step 4: Create repository labels**

Create `triage`, `bug`, `enhancement`, `performance`, `compatibility`, `needs-reproduction`, `agent-ready`, `agent-working`, and `needs-human-review` with distinct descriptions.

- [ ] **Step 5: Let CI run once before configuring required checks**

Wait for the PR `quality` check to finish and verify the remote check output, rather than relying only on local CI syntax.

- [ ] **Step 6: Configure the `main` ruleset**

Require a pull request, require the `quality` check, block force pushes and deletion, and keep only the repository administrator's emergency bypass. Do not require Copilot review.

- [ ] **Step 7: Enable safe repository features**

Enable Issues, Private Vulnerability Reporting, Dependabot alerts and Actions read/write permissions only as required by the release workflow. Keep fork PR workflows read-only and require approval before privileged execution.

- [ ] **Step 8: Verify the repository from an unauthenticated view**

Open the public URL, verify bilingual docs, license, issue forms, workflow status and package metadata links. Confirm no local-only paths or credentials are visible.

### Task 12: Merge through PR, bootstrap npm 0.1.0, and activate Trusted Publishing

**Files:**

- Remote GitHub PR and Release only.
- npm package settings only.

**Interfaces:**

- Consumes: green remote CI, protected main, verified tarball, npm user `minjo` with 2FA.
- Produces: published `react-native-sse-hooks@0.1.0`, npm provenance path for subsequent releases, and a verified Changesets loop.

- [ ] **Step 1: Review the implementation PR against every plan task**

Confirm required CI, benchmark evidence, tarball verification, Expo/Hermes verification, docs, governance and release workflows. Resolve every actionable review item and rerun checks.

- [ ] **Step 2: Merge the implementation PR through GitHub**

Use squash merge only after required checks pass. Verify remote `main` matches the approved commit.

- [ ] **Step 3: Stop for explicit user approval before npm publication**

Present package name, version, tarball file list, integrity, CI URL and Expo verification summary. Do not run `npm publish` until the user explicitly approves this irreversible action.

- [ ] **Step 4: Publish the first version interactively with 2FA**

From the verified `main` commit and exact tarball, run `npm publish`. The user completes Touch ID/2FA locally. Verify `npm view react-native-sse-hooks@0.1.0 version dist.integrity repository`.

- [ ] **Step 5: Configure npm Trusted Publisher**

Bind npm package `react-native-sse-hooks` to GitHub user `Minjo620`, repository `react-native-sse-hooks`, workflow `release.yml`, environment `npm`, allowed action `npm publish`. Do not create an npm token.

- [ ] **Step 6: Verify the automated release loop without publishing a second real version**

Use a temporary branch and patch Changeset to confirm the release workflow opens/updates a Release PR and notifies `Minjo620`. Close the test PR and remove the temporary branch without merging or publishing.

- [ ] **Step 7: Verify public installation**

In a new temporary directory, run `npm install react-native-sse-hooks@0.1.0`, load CJS and ESM entry points, typecheck a Hook usage fixture, and verify npm provenance on the package page if available for the bootstrap method.

- [ ] **Step 8: Record final release evidence**

Add the npm URL, GitHub Release URL, source commit, integrity and verification date to the release record in a follow-up documentation PR; do not directly push `main`.

## Plan Self-Review

- Spec coverage: bilingual README, Chinese JSDoc, objective comparison, measurable performance claims, Hermes/V8 caveats, Issue collection, CI, scheduled/manual benchmark, Changesets Release PR, tarball verification, Expo validation, GitHub protection and npm OIDC are each assigned to a task.
- Security coverage: secret scan precedes both initial commit and public push; npm credentials never enter workflows; first publish requires explicit approval and 2FA.
- Over-design check: no custom Agent service, database, notification server, native parser, runtime dependency, paid runner, Copilot or external messaging integration is introduced.
- Placeholder scan: no `TBD`, `TODO`, “implement later”, or unspecified error-handling steps remain.
- Verification boundary: shared-runner timing is evidence only; correctness gates and fixed-device release verification remain distinct.
