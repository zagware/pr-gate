# PR Gate

A GitHub Action that enforces Jira-linked pull request policies — ticket linking, status gates, branch naming, and reviewer requirements — as native GitHub check runs that can block merges.

**No Forge app, no hosted server, no extra infrastructure.** Everything runs inside your repo's GitHub Actions. Jira is reached directly over its REST API using credentials stored as GitHub secrets.

- [Config wizard](https://zagware.github.io/pr-gate/) — generate your config files in a browser
- [Releases](https://github.com/zagware/pr-gate/releases)
- MIT licensed, free to use and modify

---

## How it works

PR Gate runs as a GitHub Actions workflow in your repository. When a pull request is opened, updated, or reviewed, the workflow:

1. Reads your `.pr-gate.yml` configuration from the repo root
2. Extracts Jira ticket keys from the PR title, body, and branch name
3. Calls the Jira REST API to check issue status and metadata
4. Evaluates each enabled rule
5. Posts the results as a **GitHub check run** on the PR

Each rule is configured as either `block` (prevents merging) or `warn` (visible but non-blocking). When a blocking rule fails, the check run reports `failure` and — if you have configured PR Gate as a required status check in your branch protection rules — the merge button is disabled until the issue is resolved.

---

## Quick start

### 1. Add the workflow file

Create `.github/workflows/pr-gate.yml` in your repository:

```yaml
name: PR Gate

on:
  pull_request:
    types: [opened, reopened, synchronize, ready_for_review]
  pull_request_review:
    types: [submitted]

permissions:
  checks: write
  pull-requests: read

jobs:
  pr-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: zagware/pr-gate@v1
        with:
          jira-base-url: ${{ secrets.JIRA_BASE_URL }}
          jira-email: ${{ secrets.JIRA_EMAIL }}
          jira-api-token: ${{ secrets.JIRA_API_TOKEN }}
```

### 2. Add your config file

Create `.pr-gate.yml` in your repository root, or use the [config wizard](https://zagware.github.io/pr-gate/) to generate one interactively.

Minimal example:

```yaml
jira:
  project_keys: ["PROJ"]
  require_in_title: true
  allowed_statuses_for_merge:
    - "In Review"
    - "Ready for QA"
```

### 3. Add GitHub secrets

Go to your repository → **Settings** → **Secrets and variables** → **Actions**, and add:

| Secret | Value |
|--------|-------|
| `JIRA_BASE_URL` | Your Jira site URL, e.g. `https://yourcompany.atlassian.net` |
| `JIRA_EMAIL` | Email address of the Jira account used for API access |
| `JIRA_API_TOKEN` | API token for that account — generate at [id.atlassian.com](https://id.atlassian.com) → Security → API tokens |

### 4. Make it required (optional but recommended)

To actually prevent merging when checks fail:

1. Go to your repository → **Settings** → **Branches**
2. Edit (or create) a branch protection rule for `main`
3. Enable **Require status checks to pass before merging**
4. Search for and add **PR Gate** to the required checks list

Once added, GitHub will not allow the PR to merge until PR Gate reports success.

---

## The workflow file explained

```yaml
on:
  pull_request:
    types: [opened, reopened, synchronize, ready_for_review]
  pull_request_review:
    types: [submitted]
```

**`pull_request`** triggers cover:
- `opened` — new PR created
- `reopened` — previously closed PR reopened
- `synchronize` — new commits pushed to the PR branch
- `ready_for_review` — PR converted from draft to ready

**`pull_request_review`** with `submitted` triggers when a reviewer submits a review. This is necessary so PR Gate can re-evaluate the reviewer-assigned check when approvals come in, and to pick up the Jira status gate if your workflow requires approval before a Jira transition.

```yaml
permissions:
  checks: write
  pull-requests: read
```

These are the minimum permissions required:
- `checks: write` — allows PR Gate to create and update the check run on the PR
- `pull-requests: read` — allows reading PR metadata (title, body, reviewers, labels)

If your repository uses a custom `GITHUB_TOKEN` or a GitHub App token with restricted permissions, ensure both of these scopes are granted.

```yaml
      - uses: actions/checkout@v4
```

Required so that `.pr-gate.yml` is available in the working directory when the action runs.

```yaml
      - uses: zagware/pr-gate@v1
        with:
          jira-base-url: ${{ secrets.JIRA_BASE_URL }}
          jira-email: ${{ secrets.JIRA_EMAIL }}
          jira-api-token: ${{ secrets.JIRA_API_TOKEN }}
```

The three Jira secrets are the only required inputs. See [Action inputs](#action-inputs) for all available options.

---

## Configuration reference

All configuration lives in `.pr-gate.yml` in your repository root. The path can be changed via the `config-path` action input.

### Full example

```yaml
jira:
  project_keys: ["ZA", "PLAT", "INF"]
  require_in_title: true
  allowed_statuses_for_merge:
    - "In Review"
    - "Ready for QA"
  transition_on_pr_open: "In Progress"
  transition_on_pr_merge: "Done"

branch:
  pattern: "^(feat|fix|chore)/{ticket}-[a-z0-9-]+$"
  enforcement: block

reviewers:
  require_assigned: warn

labels:
  from_jira_type: true
  from_jira_priority: true
```

### `jira` block

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `project_keys` | `string[]` | — | **Required.** Jira project keys to recognise, e.g. `["ZA", "PLAT"]`. Keys outside this list are ignored. |
| `require_in_title` | `boolean` | `true` | When `true`, the PR title must contain a Jira key. This is always a blocking rule. |
| `allowed_statuses_for_merge` | `string[]` | `["In Review", "Ready for QA"]` | The linked Jira issue must be in one of these statuses before the PR can merge. Status names are matched case-insensitively. Set to `[]` to disable the status gate entirely. |
| `transition_on_pr_open` | `string` | — | Optional. If set, PR Gate will transition the linked Jira issue to this status when the PR is opened or reopened. The status name is matched against available Jira transitions case-insensitively. |
| `transition_on_pr_merge` | `string` | — | Optional. If set, PR Gate will transition the linked Jira issue to this status when the PR is merged (closed with `merged: true`). |

**How ticket keys are found**

PR Gate searches for Jira keys in three places, in order of priority:

1. **PR title** — used for the `require_in_title` check
2. **PR body** — combined with the title for the status gate check
3. **Branch name** — also included in the combined key search

The extraction regex is scoped to your configured `project_keys`, so only keys like `ZA-123` or `PLAT-456` are matched — not any arbitrary `WORD-123` pattern. If a PR links to multiple tickets (e.g. both `ZA-83` and `ZA-84` appear in the title and body), PR Gate evaluates the status gate for each ticket independently. All must pass.

### `branch` block

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `pattern` | `string` | — | A regular expression the branch name must match. Use `{ticket}` as a placeholder — it expands to a regex that matches any of your configured project keys followed by a number (e.g. `ZA-123`). |
| `enforcement` | `block \| warn \| off` | `off` | Whether a failing branch name check blocks the merge (`block`), shows a warning (`warn`), or is skipped entirely (`off`). Omitting the `branch` block entirely is equivalent to `off`. |

**Pattern examples**

| Pattern | Matches | Does not match |
|---------|---------|---------------|
| `^(feat\|fix\|chore)/{ticket}-[a-z0-9-]+$` | `feat/ZA-123-add-auth` | `feature/ZA-123`, `ZA-123-add-auth` |
| `^(feature\|bugfix\|hotfix)/{ticket}.*$` | `feature/ZA-83-rate-limit` | `feat/ZA-83-rate-limit` |
| `^[a-z0-9-]+/{ticket}-[a-z0-9-]+$` | `davy/ZA-99-fix-bug` | `ZA-99-fix-bug` |

If the regex is malformed, PR Gate emits a warning rather than failing the entire check.

### `reviewers` block

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `require_assigned` | `block \| warn \| off` | `warn` | Whether the PR must have at least one reviewer assigned. `block` prevents merging; `warn` flags it without blocking; `off` disables the check. |

Note: this checks whether a reviewer has been *requested*, not whether they have approved. For approval requirements, use GitHub's native branch protection setting **Require approvals**.

### `labels` block

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `from_jira_type` | `boolean` | `false` | When `true`, automatically applies a GitHub label derived from the Jira issue type. Bug → `bug`, Story → `enhancement`, Task → `task`, Epic → `epic`. |
| `from_jira_priority` | `boolean` | `false` | When `true`, automatically applies a GitHub label derived from the Jira issue priority. Highest/High → `priority:high`, Medium → `priority:medium`, Low/Lowest → `priority:low`. |

Labels are applied using the `GITHUB_TOKEN` and will be created on the repository if they do not already exist. The `pull-requests: write` permission is required if you enable either label option — add it to your workflow:

```yaml
permissions:
  checks: write
  pull-requests: write
```

---

## Rules reference

### Rule 1 — Jira ticket in title

**Enforcement:** always `block` when enabled

Checks that the PR title contains at least one Jira ticket key matching your configured project keys. The key can appear anywhere in the title.

```
✅  [ZA-83] fix: rate limit middleware not applying to /health
✅  feat(auth): add token refresh ZA-91
❌  fix: rate limit middleware not applying to /health
```

Disable with `require_in_title: false`.

---

### Rule 2 — Jira status gate

**Enforcement:** `block`

For each Jira key found in the PR title or body, PR Gate fetches the current issue status from the Jira API and checks it against `allowed_statuses_for_merge`. The PR cannot merge until every linked ticket is in an allowed status.

If the Jira API is unreachable or returns an error for a specific ticket, that ticket's check is downgraded to `warn` so a transient API failure does not permanently block your team.

If a ticket key is present but the issue does not exist in Jira (404), the check fails with `block`.

Disable by setting `allowed_statuses_for_merge: []`.

---

### Rule 3 — Branch naming

**Enforcement:** `block` or `warn`, configurable

Checks the PR's source branch name against the configured regex pattern. The `{ticket}` placeholder in the pattern is expanded at runtime based on your `project_keys`, so you do not need to hardcode key names in the regex.

If the `branch` block is omitted or `enforcement` is set to `off`, this rule is skipped entirely.

---

### Rule 4 — Reviewer assigned

**Enforcement:** `block`, `warn`, or `off`, configurable

Checks that at least one reviewer has been requested on the PR. When set to `block`, the PR cannot merge until a reviewer is assigned.

---

## Action inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `jira-base-url` | Yes | — | Full URL of your Jira site, e.g. `https://yourcompany.atlassian.net` |
| `jira-email` | Yes | — | Email address of the Jira account used for API authentication |
| `jira-api-token` | Yes | — | Jira API token for the account above |
| `github-token` | No | `${{ github.token }}` | Token used to post the check run. The default is sufficient in most cases. |
| `config-path` | No | `.pr-gate.yml` | Path to the config file, relative to the repo root. Useful if you keep config in a subdirectory. |

---

## Action outputs

After the action runs, these outputs are available to subsequent steps in the same job:

| Output | Values | Description |
|--------|--------|-------------|
| `result` | `pass`, `warn`, `fail` | Overall result. `warn` means no blocking failures but at least one warning. |
| `checks-passed` | integer | Number of rules that passed |
| `checks-failed` | integer | Number of blocking rules that failed |
| `checks-warned` | integer | Number of non-blocking rules that flagged a warning |

Example — using outputs in a downstream step:

```yaml
      - uses: zagware/pr-gate@v1
        id: gate
        with:
          jira-base-url: ${{ secrets.JIRA_BASE_URL }}
          jira-email: ${{ secrets.JIRA_EMAIL }}
          jira-api-token: ${{ secrets.JIRA_API_TOKEN }}

      - if: steps.gate.outputs.result == 'fail'
        run: echo "PR Gate blocked this merge — ${{ steps.gate.outputs.checks-failed }} check(s) failed"
```

---

## Jira API setup

PR Gate uses the [Jira REST API v3](https://developer.atlassian.com/cloud/jira/platform/rest/v3/) with Basic authentication (email + API token). No Forge app, no OAuth flow, and no Atlassian Marketplace listing is required.

**To generate an API token:**

1. Go to [id.atlassian.com](https://id.atlassian.com) → Security → API tokens
2. Click **Create API token**
3. Give it a label (e.g. `pr-gate-ci`) and copy the token immediately
4. Add it as `JIRA_API_TOKEN` in your repository secrets

**Permissions the Jira account needs:**

- **Browse Projects** — to read issue status and metadata
- **Transition Issues** — only required if you use `transition_on_pr_open` or `transition_on_pr_merge`

A dedicated service account is recommended over a personal account so that API access does not break if someone leaves the team.

---

## Auto-transitions

When `transition_on_pr_open` or `transition_on_pr_merge` are configured, PR Gate will attempt to move the linked Jira issue to the specified status when the corresponding GitHub event occurs.

```yaml
jira:
  project_keys: ["ZA"]
  transition_on_pr_open: "In Progress"
  transition_on_pr_merge: "Done"
```

With this config:
- Opening a PR linked to `ZA-83` moves it from `To Do` → `In Progress`
- Merging that PR moves it from whatever status it is in → `Done`

**How transitions are resolved**

PR Gate fetches the list of available transitions for the issue via `GET /rest/api/3/issue/{key}/transitions` and matches the configured status name case-insensitively against both the transition name and the target status name. This means you can use either the transition name (e.g. `"Start Progress"`) or the destination status name (e.g. `"In Progress"`) and PR Gate will find the right one.

If the transition is not available for that issue's current status, or if the Jira account does not have permission, the transition failure is logged as a warning but does not cause the check run to fail.

---

## Running on multiple repositories

For organisation-wide enforcement, add the workflow to each repository individually. If you want to maintain a single shared config, you can point `config-path` at a file fetched from a central location, or use a reusable workflow stored in an internal actions repo.

To use a custom config path:

```yaml
      - uses: zagware/pr-gate@v1
        with:
          jira-base-url: ${{ secrets.JIRA_BASE_URL }}
          jira-email: ${{ secrets.JIRA_EMAIL }}
          jira-api-token: ${{ secrets.JIRA_API_TOKEN }}
          config-path: .github/pr-gate.yml
```

Secrets can be defined at the organisation level so you do not need to add them per-repository. Go to your GitHub organisation → **Settings** → **Secrets and variables** → **Actions** → **New organisation secret**.

---

## Config wizard

The [interactive wizard](https://zagware.github.io/pr-gate/) walks through all configuration options and generates both files — `.pr-gate.yml` and `.github/workflows/pr-gate.yml` — ready to copy into your repository. No account or sign-up required.

---

## Contributing

Pull requests are welcome. The project is intentionally small and dependency-light — please keep it that way.

```bash
git clone https://github.com/zagware/pr-gate.git
cd pr-gate
npm install
npm run build        # compiles TypeScript and bundles with ncc → dist/
```

The compiled `dist/` must be committed alongside source changes so the action is immediately usable without a separate build step at install time. The CI workflow (`build.yml`) will fail if `dist/` is out of sync with the source.

**Project structure**

```
action.yml               GitHub Action metadata (inputs, outputs, entry point)
src/
  index.ts               Entry point — reads inputs, calls rules, posts results
  config.ts              Loads and validates .pr-gate.yml
  jira.ts                Jira REST API client + key extraction regex
  rules.ts               Rule evaluation engine — one function per rule
  github.ts              Posts the check run with annotations
dist/                    ncc-bundled output — committed to the repo
ui/
  index.html             Self-contained config wizard (vanilla HTML/JS)
.pr-gate.example.yml     Annotated example config file
```

---

## License

MIT — see [LICENSE](./LICENSE).

Built by [Zagware](https://zagware.io).
