from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from langgraph.types import Command

from .schema import PlanRequest
from .service import AgentService

router = APIRouter()

@router.post("/plan")
async def plan_request(request: PlanRequest):
    return StreamingResponse(
        AgentService.get_plan(
            message = request.message,
            thread_id = request.thread_id
        ),
        media_type="text/event-stream",
        headers={
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )

#TODO: get_plan needs a message and get_agent_state I might change it later
@router.post("/submit-approval")
async def submit_human_approval(request):
    AgentService.get_agent_state(request.thread_id)

    resume_payload = Command(resume={"action"})
    return StreamingResponse(
        AgentService.get_plan(
            thread_id = request.thread_id
        ),
        media_type="text/event-stream",
        headers={
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )