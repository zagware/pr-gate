import * as core from '@actions/core'
import * as github from '@actions/github'
import { loadConfig } from './config.js'
import { JiraClient } from './jira.js'
import { evaluateRules } from './rules.js'
import { postCheckResults } from './github.js'

async function run(): Promise<void> {
  const jiraBaseUrl = core.getInput('jira-base-url', { required: true })
  const jiraEmail = core.getInput('jira-email', { required: true })
  const jiraToken = core.getInput('jira-api-token', { required: true })
  const githubToken = core.getInput('github-token') || process.env.GITHUB_TOKEN
  const configPath = core.getInput('config-path') || '.pr-gate.yml'

  if (!githubToken) {
    throw new Error('No GitHub token available — set github-token input or GITHUB_TOKEN env var')
  }

  const { context } = github
  const pr = context.payload.pull_request
  if (!pr) {
    core.info('Not a pull_request or pull_request_review event — nothing to do')
    return
  }

  core.info(`PR Gate evaluating #${pr.number}: "${pr.title}"`)
  core.info(`  Branch: ${pr.head.ref} → ${pr.base.ref}`)

  const config = loadConfig(configPath)
  const jira = new JiraClient(jiraBaseUrl, jiraEmail, jiraToken)
  const octokit = github.getOctokit(githubToken)

  const results = await evaluateRules(config, jira, {
    prTitle: (pr.title as string) ?? '',
    prBody: (pr.body as string) ?? '',
    branchName: pr.head.ref as string,
    targetBranch: pr.base.ref as string,
    reviewerCount: ((pr.requested_reviewers as unknown[]) ?? []).length,
    labels: ((pr.labels as Array<{ name: string }>) ?? []).map(l => l.name),
  })

  const summary = await postCheckResults(
    octokit,
    context.repo.owner,
    context.repo.repo,
    pr.head.sha as string,
    results,
  )

  core.setOutput('result', summary.result)
  core.setOutput('checks-passed', String(summary.passed))
  core.setOutput('checks-failed', String(summary.failed))
  core.setOutput('checks-warned', String(summary.warned))

  if (summary.failed > 0) {
    core.setFailed(`PR Gate: ${summary.failed} check(s) must pass before merging`)
  }
}

run().catch(err => core.setFailed(String(err)))
