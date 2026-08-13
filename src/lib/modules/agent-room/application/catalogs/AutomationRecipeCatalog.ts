import type { AutomationFormInput } from '../../contracts/schemas/automation.schema.js';

export type AutomationRecipe = {
  id: string;
  category: 'development' | 'design' | 'marketing' | 'research' | 'operations';
  defaults: Partial<AutomationFormInput>;
};

export const automationRecipes: AutomationRecipe[] = [
  {
    id: 'development-pr-review',
    category: 'development',
    defaults: {
      triggerType: 'github_pull_request', githubEvent: 'updated', actionType: 'prompt_agent',
      prompt: 'Review the pull request update. Inspect the diff, identify regressions, and record actionable findings.',
    },
  },
  {
    id: 'design-feedback-triage',
    category: 'design',
    defaults: {
      triggerType: 'task', taskEvent: 'created', actionType: 'prompt_agent',
      prompt: 'Triage the new design task. Check the references, accessibility, interaction states, and propose the next concrete action.',
    },
  },
  {
    id: 'marketing-handoff',
    category: 'marketing',
    defaults: {
      triggerType: 'task', taskEvent: 'completed', actionType: 'create_task',
      taskTitle: 'Prepare campaign handoff', taskDescription: 'Review the completed campaign work and prepare the publishing handoff.',
    },
  },
  {
    id: 'research-digest',
    category: 'research',
    defaults: {
      triggerType: 'schedule', intervalMinutes: 1440, actionType: 'prompt_agent',
      prompt: 'Summarize the latest research notes, separate evidence from inference, and highlight unanswered questions.',
    },
  },
  {
    id: 'operations-usage-guard',
    category: 'operations',
    defaults: {
      triggerType: 'usage_threshold', usageProvider: 'claude', usageWindow: 'weekly', usagePercent: 85,
      actionType: 'notify', notificationTitle: 'Provider capacity',
      notificationMessage: 'The configured provider usage threshold was reached. Review routing before assigning more work.',
    },
  },
];
