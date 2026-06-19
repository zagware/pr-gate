import type { Config, Enforcement } from './config.js';
import type { JiraClient } from './jira.js';
export interface RuleResult {
    name: string;
    enforcement: Enforcement;
    passed: boolean;
    message: string;
    detail?: string;
}
export interface PRContext {
    prTitle: string;
    prBody: string;
    branchName: string;
    targetBranch: string;
    reviewerCount: number;
    labels: string[];
}
export declare function evaluateRules(config: Config, jira: JiraClient, ctx: PRContext): Promise<RuleResult[]>;
