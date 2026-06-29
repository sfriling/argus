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
