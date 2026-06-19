import * as core from '@actions/core'
import { getOctokit } from '@actions/github'
import type { RuleResult } from './rules.js'

type Octokit = ReturnType<typeof getOctokit>

export interface CheckSummary {
  result: 'pass' | 'warn' | 'fail'
  passed: number
  warned: number
  failed: number
}

export async function postCheckResults(
  octokit: Octokit,
  owner: string,
  repo: string,
  sha: string,
  results: RuleResult[],
): Promise<CheckSummary> {
  const failed = results.filter(r => !r.passed && r.enforcement === 'block')
  const warned = results.filter(r => !r.passed && r.enforcement === 'warn')
  const passed = results.filter(r => r.passed)

  const conclusion: 'failure' | 'success' = failed.length > 0 ? 'failure' : 'success'
  const result: CheckSummary['result'] =
    failed.length > 0 ? 'fail' : warned.length > 0 ? 'warn' : 'pass'

  const titleParts: string[] = []
  if (failed.length > 0) titleParts.push(`${failed.length} check(s) failed`)
  if (warned.length > 0) titleParts.push(`${warned.length} warning(s)`)
  if (failed.length === 0) titleParts.push(`${passed.length}/${results.length} checks passed`)

  const text = results
    .map(r => {
      const icon = r.passed ? '✅' : r.enforcement === 'block' ? '❌' : '⚠️'
      const lines = [`${icon} **${r.name}** — ${r.message}`]
      if (r.detail) lines.push(`  > ${r.detail}`)
      return lines.join('\n')
    })
    .join('\n\n')

  await octokit.rest.checks.create({
    owner,
    repo,
    name: 'PR Gate',
    head_sha: sha,
    status: 'completed',
    conclusion,
    output: {
      title: titleParts.join(' · '),
      summary: buildSummary(passed.length, warned.length, failed.length, results.length),
      text,
    },
  })

  for (const r of failed) core.error(`[PR Gate] ${r.name}: ${r.message}`)
  for (const r of warned) core.warning(`[PR Gate] ${r.name}: ${r.message}`)
  for (const r of passed) core.info(`[PR Gate] ✓ ${r.name}: ${r.message}`)

  return { result, passed: passed.length, warned: warned.length, failed: failed.length }
}

function buildSummary(passed: number, warned: number, failed: number, total: number): string {
  const parts = [`**${passed}/${total}** checks passed`]
  if (failed > 0) parts.push(`**${failed}** blocking failure(s)`)
  if (warned > 0) parts.push(`**${warned}** warning(s)`)
  return parts.join(' · ')
}
