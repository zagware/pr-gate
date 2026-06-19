import type { Config, Enforcement } from './config.js'
import type { JiraClient } from './jira.js'
import { extractJiraKeys } from './jira.js'

export interface RuleResult {
  name: string
  enforcement: Enforcement
  passed: boolean
  message: string
  detail?: string
}

export interface PRContext {
  prTitle: string
  prBody: string
  branchName: string
  targetBranch: string
  reviewerCount: number
  labels: string[]
}

export async function evaluateRules(
  config: Config,
  jira: JiraClient,
  ctx: PRContext,
): Promise<RuleResult[]> {
  const results: RuleResult[] = []

  // ── Rule 1: Jira key in PR title ─────────────────────────────────────────
  const titleKeys = extractJiraKeys(ctx.prTitle, config.jira.project_keys)
  const bodyKeys = extractJiraKeys(ctx.prBody, config.jira.project_keys)
  const allKeys = [...new Set([...titleKeys, ...bodyKeys])]

  if (config.jira.require_in_title) {
    results.push({
      name: 'Jira ticket in title',
      enforcement: 'block',
      passed: titleKeys.length > 0,
      message:
        titleKeys.length > 0
          ? `Found ${titleKeys.join(', ')} in PR title`
          : 'No Jira ticket key found in PR title',
      detail:
        titleKeys.length === 0
          ? `Add a key like ${config.jira.project_keys[0] ?? 'PROJ'}-123 to the PR title`
          : undefined,
    })
  }

  // ── Rule 2: Jira status gate (one check per linked ticket) ───────────────
  const statusGateEnabled = config.jira.allowed_statuses_for_merge.length > 0
  if (statusGateEnabled && allKeys.length > 0) {
    for (const key of allKeys) {
      let issue = null
      try {
        issue = await jira.getIssue(key)
      } catch (err) {
        results.push({
          name: `Jira status · ${key}`,
          enforcement: 'warn',
          passed: false,
          message: `Could not fetch ${key} from Jira`,
          detail: String(err),
        })
        continue
      }

      if (!issue) {
        results.push({
          name: `Jira status · ${key}`,
          enforcement: 'block',
          passed: false,
          message: `${key} not found in Jira`,
          detail: `Check the ticket key and Jira project access`,
        })
        continue
      }

      const current = issue.fields.status.name
      const allowed = config.jira.allowed_statuses_for_merge
      const passed = allowed.some(s => s.toLowerCase() === current.toLowerCase())
      results.push({
        name: `Jira status · ${key}`,
        enforcement: 'block',
        passed,
        message: passed
          ? `${key} is "${current}" ✓`
          : `${key} is "${current}" — merge requires: ${allowed.join(' | ')}`,
        detail: passed
          ? undefined
          : `Move ${key} to an allowed status before merging to ${ctx.targetBranch}`,
      })
    }
  } else if (statusGateEnabled && allKeys.length === 0) {
    // No keys found at all — ticket-in-title rule will already have caught this
  }

  // ── Rule 3: Branch naming ─────────────────────────────────────────────────
  const branchCfg = config.branch
  if (branchCfg?.pattern && branchCfg.enforcement !== 'off') {
    const rawPattern = branchCfg.pattern
    let pattern = rawPattern
    if (pattern.includes('{ticket}')) {
      const keyPart =
        config.jira.project_keys.length > 0
          ? `(?:${config.jira.project_keys.join('|')})-\\d+`
          : '[A-Z]+-\\d+'
      pattern = pattern.replace('{ticket}', keyPart)
    }

    let passed = false
    try {
      passed = new RegExp(pattern).test(ctx.branchName)
    } catch {
      // Malformed regex — warn rather than crash
      results.push({
        name: 'Branch naming',
        enforcement: 'warn',
        passed: false,
        message: `Invalid branch pattern in config: ${rawPattern}`,
      })
      return results
    }

    results.push({
      name: 'Branch naming',
      enforcement: branchCfg.enforcement,
      passed,
      message: passed
        ? `Branch matches required pattern`
        : `Branch "${ctx.branchName}" doesn't match pattern: ${rawPattern}`,
    })
  }

  // ── Rule 4: Reviewer assigned ────────────────────────────────────────────
  const reviewerCfg = config.reviewers
  if (reviewerCfg?.require_assigned && reviewerCfg.require_assigned !== 'off') {
    results.push({
      name: 'Reviewer assigned',
      enforcement: reviewerCfg.require_assigned,
      passed: ctx.reviewerCount > 0,
      message:
        ctx.reviewerCount > 0
          ? `${ctx.reviewerCount} reviewer(s) assigned`
          : 'No reviewer assigned to this PR',
      detail: ctx.reviewerCount === 0 ? 'Assign at least one reviewer before merging' : undefined,
    })
  }

  return results
}
