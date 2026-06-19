export type Enforcement = 'block' | 'warn' | 'off';
export interface JiraConfig {
    project_keys: string[];
    require_in_title: boolean;
    allowed_statuses_for_merge: string[];
    transition_on_pr_open?: string;
    transition_on_pr_merge?: string;
}
export interface BranchConfig {
    pattern?: string;
    enforcement: Enforcement;
}
export interface ReviewerConfig {
    require_assigned: Enforcement;
}
export interface LabelsConfig {
    from_jira_type: boolean;
    from_jira_priority: boolean;
}
export interface Config {
    jira: JiraConfig;
    branch?: BranchConfig;
    reviewers?: ReviewerConfig;
    labels?: LabelsConfig;
}
export declare function loadConfig(path: string): Config;
