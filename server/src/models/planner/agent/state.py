from typing import Annotated, Literal, Optional
from typing_extensions import TypedDict, Union

from langgraph.graph.message import HumanMessage, AIMessage, add_messages
from pydantic import BaseModel, Field

class AgentState(TypedDict):
    request: str
    approval_status: Optional[Literal["rejected", "approval"]]
    plan_summary: Optional[str]
    suggested_file: Optional[SuggestFileEdit]

class SuggestFileEdit(BaseModel):
    file_path: str = Field(description="the suggest file edits path")
    file_edits: str

class PlanOutput(BaseModel):
    summary: str = Field(description="the plan summary")
    steps = list(str) = Field(descriptions="the plan steps")
    suggested_changes = list(SuggestFileEdit) = Field(description="suggested file changes to make plan work")


