from fastapi import FastAPI

app = FastAPI(
    title="T.C. Zuid TOS planner API",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "planner-api"}
