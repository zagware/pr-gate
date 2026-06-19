import { getOctokit } from '@actions/github';
import type { RuleResult } from './rules.js';
type Octokit = ReturnType<typeof getOctokit>;
export interface CheckSummary {
    result: 'pass' | 'warn' | 'fail';
    passed: number;
    warned: number;
    failed: number;
}
export declare function postCheckResults(octokit: Octokit, owner: string, repo: string, sha: string, results: RuleResult[]): Promise<CheckSummary>;
export {};
