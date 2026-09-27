from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver

from .state import AgentState
from .nodes import generate_plan, change_file, human_review, apply_edits

def create_agent_graph():
    builder = StateGraph(AgentState)
    builder.add_node("generate_plan", generate_plan)
    builder.add_node("change_file", change_file)
    builder.add_node("human_review", human_review)

    builder.add_edge(START, "generate_plan")
    builder.add_edge("generate_plan", "human_review")
    builder.add_conditional_edges(
        "human_review",
        apply_edits,
        {
            "use_tool": "change_file",
            "plan_again": "generate_plan"
        }
    )
    builder.add_edge("change_file", END)

    checkpointer = MemorySaver()
    return builder.compile(checkpointer=checkpointer)

agent = create_agent_graph()