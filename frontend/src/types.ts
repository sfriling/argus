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
  active: boolean;
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
