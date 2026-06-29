export type KanbanCounts = Record<string, number>;

export type InFlightTask = {
  id: string;
  title: string;
  assignee: string;
  status: string;
};

export type CronEntry = {
  name: string;
  schedule: string;
  next_run: string;
  last_status: string;
};

export type ReliabilityRecent = {
  tool: string;
  field: string;
  action: string;
  attempt: number;
};

export type UsageModel = {
  name: string;
  sessions: number;
  tokens: number;
};

export type UsageTool = {
  name: string;
  calls: number;
};

export type Usage = {
  days: number;
  sessions: number;
  messages: number;
  tool_calls: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  active_time: string;
  models: UsageModel[];
  top_tools: UsageTool[];
};

export type SessionEntry = {
  id: string;
  title: string;
  preview: string;
  last_active: string;
};

export type ClaudeAgent = {
  id: string;
  name: string;
  task: string;
  state: string; // active | idle | blocked | done
  model: string;
  tokens: number;
  in_flight: number;
  cwd: string;
  session_id: string;
  created_at: string;
  updated_at: string;
  live: boolean;
  busy: boolean;
  active: boolean;
};

export type SessionMeta = {
  id: string;
  title: string;
  model: string;
  message_count: number;
  tool_call_count: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  started_at: number | null;
  ended_at: number | null;
  end_reason: string;
};

export type SessionMessage = {
  role: string;
  text: string;
  tools: string[];
  tool_name: string;
  result: string;
  truncated: boolean;
};

export type SessionDetail = {
  meta: SessionMeta;
  messages: SessionMessage[];
};

export type PanelError = {
  panel: string;
  message: string;
};

export type InstanceOverview = {
  name: string;
  transport: 'local' | 'ssh';
  reachable: boolean;
  error: string | null;
  gateway: { up: boolean; detail: string };
  dispatcher: { running: boolean };
  active_profile: string;
  profiles: string[];
  kanban: {
    counts: KanbanCounts;
    in_flight: InFlightTask[];
  };
  crons: CronEntry[];
  reliability: {
    configured: boolean;
    today: { catches: number; loop_breaks: number };
    recent: ReliabilityRecent[];
  };
  usage: Usage;
  sessions: SessionEntry[];
  panel_errors: PanelError[];
};

export type Overview = {
  generated_at: string;
  refresh_seconds: number;
  instances: InstanceOverview[];
  claude_agents: ClaudeAgent[];
  features?: { skill_review?: boolean };
};

export type SkillGap = {
  title: string;
  evidence: string;
  recommendation: string;
  target_skill: string;
  suggested_edit: string;
};

export type SkillHealth = { skill: string; finding: string; severity: string };
export type DriftItem = { concern: string; detail: string };

export type ReviewReport = {
  generated_at: string;
  instance: string;
  model: string;
  sessions_reviewed: string[];
  summary: string;
  gaps: SkillGap[];
  health: SkillHealth[];
  drift: DriftItem[];
};

export type ConfigInstance = {
  name: string;
  transport: 'local' | 'ssh';
  profile?: string;
  hermes_home?: string;
  hermes_bin?: string;
  ssh?: string | null;
  ssh_key?: string | null;
  reliability_log?: string | null;
};

export type ArgusConfig = {
  host: string;
  port: number;
  refresh_seconds: number;
  claude_home: string;
  enable_config_writes: boolean;
  instances: ConfigInstance[];
};

export type ConfigMeta = {
  path: string;
  writable: boolean;
  localhost_bound: boolean;
  writes_enabled: boolean;
};

export type ConfigResponse = {
  config: ArgusConfig;
  meta: ConfigMeta;
};

export type BoardTask = {
  id: string;
  title: string;
  status: string;
  assignee?: string | null;
  body?: string | null;
  priority?: number;
  created_at?: string;
  started_at?: string | null;
  completed_at?: string | null;
  result?: string | null;
};

export type BoardMeta = {
  instance: string;
  writable: boolean;
  actions_enabled: boolean;
  profiles: string[];
};

export type BoardResponse = {
  tasks: BoardTask[];
  meta: BoardMeta;
};
