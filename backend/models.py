from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class GatewayStatus(BaseModel):
    up: bool = False
    detail: str = ""


class Dispatcher(BaseModel):
    running: bool = False


class KanbanTask(BaseModel):
    id: str
    title: str = ""
    assignee: str = ""
    status: str = ""


class Kanban(BaseModel):
    counts: dict[str, int] = Field(default_factory=dict)
    in_flight: list[KanbanTask] = Field(default_factory=list)


class Cron(BaseModel):
    name: str = ""
    schedule: str = ""
    next_run: str = ""
    last_status: str = ""


class ReliabilityEvent(BaseModel):
    tool: str = ""
    field: str = ""
    action: str = ""
    attempt: int = 0


class ReliabilityToday(BaseModel):
    catches: int = 0
    loop_breaks: int = 0


class Reliability(BaseModel):
    configured: bool = False   # the trajectory log exists (i.e. the guard plugin is installed)
    today: ReliabilityToday = Field(default_factory=ReliabilityToday)
    recent: list[ReliabilityEvent] = Field(default_factory=list)


class UsageModel(BaseModel):
    name: str
    sessions: int = 0
    tokens: int = 0


class UsageTool(BaseModel):
    name: str
    calls: int = 0


class Usage(BaseModel):
    days: int = 7
    sessions: int = 0
    messages: int = 0
    tool_calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    active_time: str = ""
    models: list[UsageModel] = Field(default_factory=list)
    top_tools: list[UsageTool] = Field(default_factory=list)


class Session(BaseModel):
    id: str
    title: str = ""
    preview: str = ""
    last_active: str = ""


class ClaudeAgent(BaseModel):
    id: str
    name: str = ""
    task: str = ""          # the job's current `detail`, truncated
    state: str = ""         # raw state.json state: active | idle | blocked | done
    model: str = ""
    tokens: int = 0
    in_flight: int = 0
    cwd: str = ""
    session_id: str = ""
    created_at: str = ""
    updated_at: str = ""
    live: bool = False      # a sessions/*.json entry exists for this job
    busy: bool = False      # the live session is actively working (status == busy)
    active: bool = False    # grouping flag: pinned at top vs. recent history


class SessionMeta(BaseModel):
    id: str = ""
    title: str = ""
    model: str = ""
    message_count: int = 0
    tool_call_count: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0
    started_at: Optional[float] = None   # epoch seconds
    ended_at: Optional[float] = None
    end_reason: str = ""


class SessionMessage(BaseModel):
    role: str
    text: str = ""              # user/assistant content
    tools: list[str] = Field(default_factory=list)  # tools an assistant turn called
    tool_name: str = ""         # the tool a 'tool' row is the result of
    result: str = ""            # the tool result content (possibly truncated)
    truncated: bool = False


class SessionDetail(BaseModel):
    meta: SessionMeta = Field(default_factory=SessionMeta)
    messages: list[SessionMessage] = Field(default_factory=list)


class SkillGap(BaseModel):
    title: str
    evidence: str = ""               # which session + what went wrong
    recommendation: str = ""
    target_skill: str = ""           # an existing skill to harden, or "new"
    suggested_edit: str = ""         # the concrete text/diff to add


class SkillHealth(BaseModel):
    skill: str
    finding: str
    severity: str = "info"           # "info" | "warn"


class DriftItem(BaseModel):
    concern: str
    detail: str = ""


class ReviewReport(BaseModel):
    generated_at: str = ""
    instance: str = ""
    model: str = ""
    sessions_reviewed: list[str] = Field(default_factory=list)
    summary: str = ""
    gaps: list[SkillGap] = Field(default_factory=list)
    health: list[SkillHealth] = Field(default_factory=list)
    drift: list[DriftItem] = Field(default_factory=list)


class Features(BaseModel):
    skill_review: bool = False


class PanelError(BaseModel):
    panel: str
    message: str


class InstanceOverview(BaseModel):
    name: str
    transport: Literal["local", "ssh"]
    reachable: bool = True
    error: Optional[str] = None
    gateway: GatewayStatus = Field(default_factory=GatewayStatus)
    dispatcher: Dispatcher = Field(default_factory=Dispatcher)
    active_profile: str = ""
    profiles: list[str] = Field(default_factory=list)
    kanban: Kanban = Field(default_factory=Kanban)
    crons: list[Cron] = Field(default_factory=list)
    reliability: Reliability = Field(default_factory=Reliability)
    usage: Usage = Field(default_factory=Usage)
    sessions: list[Session] = Field(default_factory=list)
    panel_errors: list[PanelError] = Field(default_factory=list)


class Overview(BaseModel):
    generated_at: str = ""
    refresh_seconds: int = 5
    instances: list[InstanceOverview] = Field(default_factory=list)
    claude_agents: list[ClaudeAgent] = Field(default_factory=list)
    features: Features = Field(default_factory=Features)
