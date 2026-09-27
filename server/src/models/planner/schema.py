from pydantic import BaseModel, Field

class PlanRequest(BaseModel):
    """
    Attributes:
    prompt: user prompt to make plan
    """
    message: str = Field(description="User message")
    thread_id: str = Field(description="chat id")
    
class PlanSchema(BaseModel):
    summary: str = Field(description="a short summary of what is the intuition behind the plan and suggested file edits")

class HumanReviewBody(BaseModel):
    """
    """
    message: str = Field(description="User review")
    thread_id: str = Field(description="chat id")