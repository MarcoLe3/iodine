from routellm.controller import Controller

# replace strong-model and weak-model
controller = Controller(
    routers=["mf"],
    strong_model="strong-model",
    weak_model="weal-model"
)

def get_routing_decision(prompt: str, threshold: float = 0.11593) -> dict:
    try:
        selected_model = None
        router = controller.routers["mf"]

        win_rate = router.calculate_strong_win_rate(prompt)

        if win_rate >= threshold:
            selected_model = "strong"
        else:
            selected_model = "weak"

        return {
            "status": "success",
            "selected_model": selected_model,
            "win_rate": float(win_rate),
            "threshold": threshold
        }
    
    except Exception as e:
        return {
            "status": "error", 
            "message": str(e)
        }