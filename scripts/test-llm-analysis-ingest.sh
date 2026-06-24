#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:3000/api/llm-analyses}"
INGEST_KEY="${1:-${LLM_ANALYSIS_INGEST_KEY:-}}"

if [ -z "$INGEST_KEY" ]; then
  echo "Usage: LLM_ANALYSIS_INGEST_KEY=your-key $0"
  echo "   or: $0 your-key"
  exit 1
fi

curl -i -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "x-local-ingest-key: $INGEST_KEY" \
  -d '{
    "ticker": "TEST",
    "companyName": "Test Stock",
    "broker": "local",
    "provider": "ollama",
    "model": "llama3.1",
    "recommendation": "hold",
    "confidence": 0.75,
    "horizon": "test",
    "thesis": "This is a test LLM analysis insert.",
    "risks": "This is only test data.",
    "rawOutput": {
      "test": true,
      "source": "scripts/test-llm-analysis-ingest.sh"
    }
  }'
