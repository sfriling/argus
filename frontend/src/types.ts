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
};
