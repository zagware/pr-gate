export interface JiraIssue {
  key: string
  fields: {
    summary: string
    status: { name: string; statusCategory: { key: string } }
    issuetype: { name: string }
    priority: { name: string } | null
    assignee: { displayName: string; emailAddress: string } | null
  }
}

export interface JiraTransition {
  id: string
  name: string
  to: { name: string }
}

export class JiraClient {
  private readonly headers: Record<string, string>
  private readonly base: string

  constructor(baseUrl: string, email: string, apiToken: string) {
    this.base = baseUrl.replace(/\/$/, '')
    const encoded = Buffer.from(`${email}:${apiToken}`).toString('base64')
    this.headers = {
      Authorization: `Basic ${encoded}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }
  }

  async getIssue(key: string): Promise<JiraIssue | null> {
    const res = await fetch(`${this.base}/rest/api/3/issue/${key}`, {
      headers: this.headers,
    })
    if (res.status === 404) return null
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Jira API ${res.status} fetching ${key}: ${body}`)
    }
    return res.json() as Promise<JiraIssue>
  }

  async getTransitions(key: string): Promise<JiraTransition[]> {
    const res = await fetch(`${this.base}/rest/api/3/issue/${key}/transitions`, {
      headers: this.headers,
    })
    if (!res.ok) {
      throw new Error(`Jira API ${res.status} fetching transitions for ${key}`)
    }
    const data = (await res.json()) as { transitions: JiraTransition[] }
    return data.transitions
  }

  async transitionIssue(key: string, targetStatus: string): Promise<void> {
    const transitions = await this.getTransitions(key)
    const match = transitions.find(
      t =>
        t.name.toLowerCase() === targetStatus.toLowerCase() ||
        t.to.name.toLowerCase() === targetStatus.toLowerCase(),
    )
    if (!match) {
      const available = transitions.map(t => t.to.name).join(', ')
      throw new Error(
        `No transition to "${targetStatus}" available for ${key}. Available: ${available}`,
      )
    }
    const res = await fetch(`${this.base}/rest/api/3/issue/${key}/transitions`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ transition: { id: match.id } }),
    })
    if (!res.ok) {
      throw new Error(`Jira API ${res.status} transitioning ${key} to "${targetStatus}"`)
    }
  }
}

// Matches Jira keys like ZA-123, PLAT-4, INF-99
// Scoped to known project keys when provided to avoid false positives.
export function extractJiraKeys(text: string, projectKeys: string[]): string[] {
  const scope = projectKeys.length > 0
    ? projectKeys.map(k => k.toUpperCase()).join('|')
    : '[A-Z][A-Z0-9]{1,9}'
  const re = new RegExp(`\\b((?:${scope})-\\d+)\\b`, 'g')
  return [...new Set([...text.matchAll(re)].map(m => m[1]))]
}
