export interface JiraIssue {
    key: string;
    fields: {
        summary: string;
        status: {
            name: string;
            statusCategory: {
                key: string;
            };
        };
        issuetype: {
            name: string;
        };
        priority: {
            name: string;
        } | null;
        assignee: {
            displayName: string;
            emailAddress: string;
        } | null;
    };
}
export interface JiraTransition {
    id: string;
    name: string;
    to: {
        name: string;
    };
}
export declare class JiraClient {
    private readonly headers;
    private readonly base;
    constructor(baseUrl: string, email: string, apiToken: string);
    getIssue(key: string): Promise<JiraIssue | null>;
    getTransitions(key: string): Promise<JiraTransition[]>;
    transitionIssue(key: string, targetStatus: string): Promise<void>;
}
export declare function extractJiraKeys(text: string, projectKeys: string[]): string[];
