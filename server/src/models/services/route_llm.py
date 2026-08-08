from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from routellm.controller import Controller
from pydantic import BaseModel, Field

class RoutingRequest(BaseModel):
    prompt: str = Field(..., description="User prompt")
    models: list[str] = Field(..., min_length=2, description="User models from same provider")
    threshold: float = Field(default=0.11593, description="threshold for cost/quality")


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.controller = Controller(
        routers=["mf"],
        strong_models="strong-placeholder",
        weak_model="weak-placeholder"
    )

    yield

    app.state.controller = None

app = FastAPI(title="Route model API", lifespan= lifespan)

# TODO: create a check if the models are from the same provider
@app.post("/route")
def get_routing_decision(body: RoutingRequest) -> dict:
    try:
        selected_model = None
        router = app.state.controller.routers["mf"]

        win_rate = float(router.calculate_strong_win_rate(body.prompt))

        # TODO: latest model and least recently used model might not be the best choice ( should explore different options from same provider )
        if win_rate >= body.threshold:
            selected_model = body.models[-1]
        else:
            selected_model = body.models[0]

        return {
            "status": "success",
            "selected_model": selected_model,
            "win_rate": float(win_rate),
            "threshold": body.threshold
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))