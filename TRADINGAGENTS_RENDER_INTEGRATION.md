# TradingAgents Render Integration Plan

Use this as the implementation brief for the `otsab19/TradingAgents` fork so it can run as a small Python web service that StockSync can call.

## Goal

Expose TradingAgents over HTTP so StockSync can request an AI analysis for a ticker/date and receive a structured result.

Recommended first deployment target: **Render Web Service**.

## Add A FastAPI Wrapper

Create `api.py` in the TradingAgents repo root:

```python
import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from tradingagents.default_config import DEFAULT_CONFIG
from tradingagents.graph.trading_graph import TradingAgentsGraph


app = FastAPI(title="TradingAgents API")


class AnalyzeRequest(BaseModel):
    ticker: str = Field(..., min_length=1, max_length=32)
    date: str = Field(..., description="Analysis date in YYYY-MM-DD format")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/analyze")
def analyze(request: AnalyzeRequest):
    try:
        config = DEFAULT_CONFIG.copy()
        config["llm_provider"] = os.getenv("TRADINGAGENTS_LLM_PROVIDER", config.get("llm_provider", "openai"))

        deep_model = os.getenv("TRADINGAGENTS_DEEP_MODEL")
        quick_model = os.getenv("TRADINGAGENTS_QUICK_MODEL")
        if deep_model:
            config["deep_think_llm"] = deep_model
        if quick_model:
            config["quick_think_llm"] = quick_model

        graph = TradingAgentsGraph(debug=False, config=config)
        _, decision = graph.propagate(request.ticker, request.date)

        return {
            "ticker": request.ticker,
            "date": request.date,
            "decision": decision,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
```

## Add Dependencies

If the repo uses `pyproject.toml`, add:

```toml
fastapi = "*"
uvicorn = "*"
```

If using `requirements.txt`, add:

```txt
fastapi
uvicorn
```

## Render Settings

Create a new **Web Service** in Render using your `otsab19/TradingAgents` fork.

Use:

```bash
Build Command: pip install . fastapi uvicorn
Start Command: uvicorn api:app --host 0.0.0.0 --port $PORT
```

## Required Render Environment Variables

Set at least one LLM provider key:

```bash
OPENAI_API_KEY=...
```

Optional but recommended:

```bash
ALPHA_VANTAGE_API_KEY=...
TRADINGAGENTS_LLM_PROVIDER=openai
TRADINGAGENTS_DEEP_MODEL=gpt-5.5
TRADINGAGENTS_QUICK_MODEL=gpt-5.4-mini
```

Use cheaper/faster models for testing if needed.

## Test Locally

From the TradingAgents repo:

```bash
pip install . fastapi uvicorn
uvicorn api:app --reload --port 8000
```

Then:

```bash
curl http://localhost:8000/health
```

And:

```bash
curl -X POST http://localhost:8000/analyze \
  -H "Content-Type: application/json" \
  -d '{"ticker":"NVDA","date":"2026-06-02"}'
```

For UK shares, use Yahoo-style tickers where possible:

```bash
RR.L
AZN.L
```

## StockSync Integration Later

After the Render service is live, StockSync can call:

```bash
POST https://<render-service>.onrender.com/analyze
```

with:

```json
{
  "ticker": "RR.L",
  "date": "2026-06-02"
}
```

For production, avoid long blocking requests. The better second version is:

1. `POST /analyze` creates a job and returns `jobId`.
2. A background task runs TradingAgents.
3. `GET /analyze/{jobId}` returns status/result.
4. StockSync stores the finished result in Supabase.

## Notes

- Do not put API keys in the repo.
- Treat TradingAgents output as research, not financial advice.
- Render free instances may sleep; the first request can be slow.
- TradingAgents runs can be slow and token-heavy, so start with one ticker at a time.
