from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage
from langgraph.types import interrupt
from typing import Literal

from .state import AgentState, PlanOutput
from .tools import suggest_file_edits

tools = [
    suggest_file_edits
]

llm = ChatOpenAI(
    model="gpt-5-mini",
    temperature="0.7"
).bind_tools(tools)

async def generate_plan(state: AgentState) -> AgentState:
    """Chatbot looks at message request and implements a plan wtih steps"""
    planner_agent = llm.with_structured_output(PlanOutput)

    messages = [
        SystemMessage(
            content="""
            You are a planning agent.

            Analyze the user's request and create a clear step-by-step plan.
            Decide which available tools are needed.
            Do not execute the tools yourself unless necessary.
            You ask the user if they would like to use the tools avaliable to satisfy their request
            """
        ),
        HumanMessage(content=state["request"]),
    ]

    plan: PlanOutput = await planner_agent.ainvoke(messages)
    state["plan_summary"] = plan.summary
    state["suggested_file"] = plan.suggested_file
    return state
#TODO: Needs a review payload
def human_review(state: AgentState) -> AgentState:
    """ Human review of planning state"""
    review_payload = {

    }
    human_decision = interrupt(review_payload)
    state["approval_status"] = human_decision.get("approval", "rejected")

def apply_edits(state: AgentState) -> Literal["use_tool", "plan_again"]:
    """Command to apply edits to file or no"""
    if state["approval_status"] == "approval":
        return "use_tool"
    return "plan_again"

async def change_file(state: AgentState) -> AgentState:
    """Chatbot ask if changes should be made after suggestion"""

    messages = [
        SystemMessage(
            content="""
            You have a plan and have already recommened changes to user
            You also have the user permission to do the task

            Execute task that the user allows permission in
            """
        ),
        *state["messages"]
    ]

    state["messages"] = await llm.ainvoke(messages)

    return state