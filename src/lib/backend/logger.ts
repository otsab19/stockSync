import pino from "pino"

const isDevelopment = process.env.NODE_ENV !== "production"

export const logger = pino({
  level: process.env.LOG_LEVEL?.trim() || (isDevelopment ? "debug" : "info"),
  redact: {
    paths: [
      "apiKey",
      "apiSecret",
      "headers.authorization",
      "headers.x-api-key",
      "headers.x-user-key",
      "credentials.apiKey",
      "credentials.apiSecret",
      "req.headers.authorization",
      "req.headers.x-api-key",
      "req.headers.x-user-key",
    ],
    censor: "[REDACTED]",
  },
  base: {
    service: "stocksync",
    env: process.env.NODE_ENV || "development",
  },
})

export function createRequestLogger(requestId: string, context: Record<string, unknown> = {}) {
  return logger.child({ requestId, ...context })
}

export function getErrorLogDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }

  return {
    message: typeof error === "string" ? error : "Unknown error",
  }
}

