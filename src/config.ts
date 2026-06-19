import * as fs from 'fs'
import * as yaml from 'js-yaml'

export type Enforcement = 'block' | 'warn' | 'off'

export interface JiraConfig {
  project_keys: string[]
  require_in_title: boolean
  allowed_statuses_for_merge: string[]
  transition_on_pr_open?: string
  transition_on_pr_merge?: string
}

export interface BranchConfig {
  pattern?: string
  enforcement: Enforcement
}

export interface ReviewerConfig {
  require_assigned: Enforcement
}

export interface LabelsConfig {
  from_jira_type: boolean
  from_jira_priority: boolean
}

export interface Config {
  jira: JiraConfig
  branch?: BranchConfig
  reviewers?: ReviewerConfig
  labels?: LabelsConfig
}

const DEFAULTS: Omit<Config, 'jira'> = {
  branch: { enforcement: 'off' },
  reviewers: { require_assigned: 'warn' },
  labels: { from_jira_type: false, from_jira_priority: false },
}

const JIRA_DEFAULTS: Omit<JiraConfig, 'project_keys'> = {
  require_in_title: true,
  allowed_statuses_for_merge: ['In Review', 'Ready for QA'],
}

export function loadConfig(path: string): Config {
  if (!fs.existsSync(path)) {
    throw new Error(`Config file not found at ${path} — add a .pr-gate.yml to your repo root`)
  }
  const raw = yaml.load(fs.readFileSync(path, 'utf8')) as Partial<Config>
  if (!raw?.jira?.project_keys?.length) {
    throw new Error('Config must include at least one jira.project_keys entry')
  }
  return {
    ...DEFAULTS,
    ...raw,
    jira: { ...JIRA_DEFAULTS, ...raw.jira },
    branch: { ...DEFAULTS.branch, ...raw.branch },
    reviewers: { ...DEFAULTS.reviewers, ...raw.reviewers },
    labels: { ...DEFAULTS.labels, ...raw.labels },
  }
}
