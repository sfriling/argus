import type { Overview, InstanceOverview, ClaudeAgent } from './types';

const sampleClaudeAgents: ClaudeAgent[] = [
  {
    id: '62b84259',
    name: 'Improve Hermes agent task execution reliability',
    task: 'Building the Claude Agents panel for Argus',
    state: 'blocked',
    model: 'opus',
    tokens: 709_259,
    in_flight: 0,
    cwd: 'D:\\Projects\\ScratchPad',
    session_id: '62b84259-c432-4a6c-904e-19f5df16e74a',
    created_at: '2026-06-28T11:35:22Z',
    updated_at: '2026-06-29T09:32:03Z',
    live: true,
    busy: true,
    active: true,
  },
  {
    id: '574bb2ac',
    name: 'Demo new local build capabilities',
    task: 'fix applied and shipped; app-1.6.2 deployed',
    state: 'done',
    model: 'opus',
    tokens: 496_549,
    in_flight: 0,
    cwd: 'D:\\Projects\\Workspace',
    session_id: '574bb2ac-ddbc-4a4a-ac5f-eac785327235',
    created_at: '2026-06-27T10:00:00Z',
    updated_at: '2026-06-28T18:20:00Z',
    live: false,
    busy: false,
    active: false,
  },
  {
    id: '10e163f6',
    name: 'Upscaler',
    task: 'Obsidian note written (Real-ESRGAN setup)',
    state: 'done',
    model: 'opus',
    tokens: 38_782,
    in_flight: 0,
    cwd: 'D:\\Projects\\Upscale',
    session_id: '10e163f6-aaaa-bbbb-cccc-ddddeeeeffff',
    created_at: '2026-06-26T09:00:00Z',
    updated_at: '2026-06-27T12:00:00Z',
    live: false,
    busy: false,
    active: false,
  },
];

const localInstance: InstanceOverview = {
  name: 'local',
  transport: 'local',
  reachable: true,
  error: null,
  gateway: { up: true, detail: 'Listening on :7700' },
  dispatcher: { running: true },
  active_profile: 'research',
  profiles: ['research', 'coding', 'minimal'],
  kanban: {
    counts: { ready: 3, running: 2, blocked: 1, done: 14 },
    in_flight: [
      {
        id: 'task-042',
        title: 'Summarise Q2 financial reports',
        assignee: 'hermes-local',
        status: 'running',
      },
      {
        id: 'task-043',
        title: 'Draft blog post: AI in 2025',
        assignee: 'hermes-local',
        status: 'running',
      },
      {
        id: 'task-044',
        title: 'Scrape competitor pricing page',
        assignee: 'hermes-local',
        status: 'ready',
      },
    ],
  },
  crons: [
    {
      name: 'Vault Health Check',
      schedule: '0 9 * * 4',
      next_run: '2026-07-02T09:00:00Z',
      last_status: 'ok',
    },
    {
      name: 'Weekly Digest',
      schedule: '0 8 * * 1',
      next_run: '2026-06-29T08:00:00Z',
      last_status: 'ok',
    },
    {
      name: 'Dependency Audit',
      schedule: '0 2 * * *',
      next_run: '2026-06-29T02:00:00Z',
      last_status: 'error',
    },
  ],
  reliability: {
    configured: true,
    today: { catches: 2, loop_breaks: 0 },
    recent: [
      {
        tool: 'patch',
        field: 'path',
        action: 'inferred',
        attempt: 1,
      },
      {
        tool: 'cronjob',
        field: 'schedule',
        action: 'rejected',
        attempt: 2,
      },
    ],
  },
  usage: {
    days: 7,
    sessions: 18,
    messages: 274,
    tool_calls: 106,
    input_tokens: 1_299_215,
    output_tokens: 85_472,
    total_tokens: 5_524_527,
    active_time: '~13h 47m',
    models: [
      { name: 'grok-4.3', sessions: 17, tokens: 5_501_145 },
      { name: 'grok-build-0.1', sessions: 1, tokens: 23_382 },
    ],
    top_tools: [
      { name: 'computer_use', calls: 25 },
      { name: 'patch', calls: 21 },
      { name: 'terminal', calls: 13 },
    ],
  },
  sessions: [
    {
      id: '20260629_093238_06533f',
      title: 'Obsidian Vault Broken Links',
      preview: 'in my obsidian vault, we seem to have',
      last_active: 'just now',
    },
    {
      id: 'cron_6cdbc5e9096e_20260628',
      title: 'say-hi-every-minute',
      preview: '[IMPORTANT: You are running as a sched',
      last_active: '19h ago',
    },
    {
      id: '20260628_143310_3e4616',
      title: '',
      preview: 'Reply with exactly: PONG',
      last_active: '19h ago',
    },
  ],
  panel_errors: [],
};

const vpsInstance: InstanceOverview = {
  name: 'vps',
  transport: 'ssh',
  reachable: true,
  error: null,
  gateway: { up: true, detail: 'Listening on :7700 (ssh tunnel)' },
  dispatcher: { running: true },
  active_profile: 'coding',
  profiles: ['coding', 'research'],
  kanban: {
    counts: { ready: 1, running: 1, blocked: 0, done: 7 },
    in_flight: [
      {
        id: 'task-091',
        title: 'Refactor auth middleware',
        assignee: 'hermes-vps',
        status: 'running',
      },
    ],
  },
  crons: [
    {
      name: 'Vault Health Check',
      schedule: '0 9 * * 4',
      next_run: '2026-07-02T09:00:00Z',
      last_status: 'ok',
    },
    {
      name: 'Log Rotation',
      schedule: '0 0 * * *',
      next_run: '2026-06-29T00:00:00Z',
      last_status: 'ok',
    },
  ],
  reliability: {
    configured: true,
    today: { catches: 0, loop_breaks: 1 },
    recent: [
      {
        tool: 'patch',
        field: 'path',
        action: 'inferred',
        attempt: 1,
      },
      {
        tool: 'bash',
        field: 'command',
        action: 'rejected',
        attempt: 3,
      },
    ],
  },
  usage: {
    days: 7,
    sessions: 6,
    messages: 48,
    tool_calls: 22,
    input_tokens: 412_006,
    output_tokens: 19_220,
    total_tokens: 1_104_722,
    active_time: '~3h 12m',
    models: [{ name: 'grok-4.3', sessions: 6, tokens: 1_104_722 }],
    top_tools: [
      { name: 'patch', calls: 9 },
      { name: 'terminal', calls: 7 },
    ],
  },
  sessions: [
    {
      id: '20260629_081502_aa12cd',
      title: 'Refactor auth middleware',
      preview: 'the auth middleware is doing too much',
      last_active: '1h ago',
    },
  ],
  panel_errors: [],
};

/** Normal sample — both instances reachable */
export const sampleOverview: Overview = {
  generated_at: new Date().toISOString(),
  refresh_seconds: 5,
  instances: [localInstance, vpsInstance],
  claude_agents: sampleClaudeAgents,
};

/** Degraded sample — vps unreachable */
const vpsInstanceDegraded: InstanceOverview = {
  ...vpsInstance,
  reachable: false,
  error: 'ssh timeout',
  gateway: { up: false, detail: 'Connection refused' },
  dispatcher: { running: false },
};

export const sampleOverviewDegraded: Overview = {
  generated_at: new Date().toISOString(),
  refresh_seconds: 5,
  instances: [localInstance, vpsInstanceDegraded],
  claude_agents: sampleClaudeAgents,
};
