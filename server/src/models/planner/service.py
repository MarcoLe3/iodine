from .agent.graph import agent
import json

class AgentService:
    @staticmethod
    async def get_plan(self, message: str, thread_id: str):
        config = {
            "configurable": {
                "thread_id": thread_id
            }
        }

        agent_inputs = {
            "messages": [{"role": "user", "content": message}]
        }
        try:
            async for chunk in agent.astream(agent_inputs, config):
                for node_name, updates in chunk.items():
                    chunk_data = {
                        "event": "node_update",
                        "node": node_name,
                        "data": updates
                    }
                    yield f"data: {json.dumps(chunk_data)}\n\n"
            agent_state = await agent.aget_state(config)
            if agent_state.next and "human_review" in agent_state.next:
                interrupt_payload = {
                    "event": "human_review_required",
                    "review_details": agent_state.tasks[0].interrupts[0].value,
                }
                yield f"data: {json.dumps(interrupt_payload)}\n\n"
            else:
                completed_state = {
                    "event": "complete",
                }
                yield f"data: {json.dumps(completed_state)}\n\n"

        except Exception as e:
            error_data = {
                "events": "error",
                "message": str(e)
            }
            yield f"data: {json.dumps(error_data)}\n\n"

    @staticmethod
    async def get_agent_state(thread_id: str):
        config = {
            "configurable": {
                "thread_id": thread_id
            }
        }

        agent_state = await agent.aget_state(config)
        if not agent_state.next:
            return Exception(detail="Thread is not a valid state to process")