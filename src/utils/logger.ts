const { appendFileSync, mkdirSync } = require("fs");
const { dirname, resolve } = require("path");
const { config } = require("dotenv");

config({ path: "src/.env" });

type LogLevel = "debug" | "info" | "warn" | "error";

type LogEntry = {
    timestamp: string;
    level: LogLevel;
    event: string;
    details?: unknown;
};

const logFilePath = resolve(
    process.env.TMS_LOG_FILE ?? "logs/tms-automation.log"
);

const maxResponseChars = Number(process.env.TMS_LOG_RESPONSE_MAX_CHARS ?? 50000);

const maskValue = (value: string) => {
    if (value.length <= 10) {
        return "***";
    }

    return `${value.slice(0, 4)}...${value.slice(-4)}`;
};

const redactString = (value: string) =>
    value
        .replace(/(JSESSIONID=)([^;"\s]+)/gi, (_match, prefix, cookie) => `${prefix}${maskValue(cookie)}`)
        .replace(/(_csrf=)([^&"'\s]+)/gi, (_match, prefix, token) => `${prefix}${maskValue(token)}`)
        .replace(/("csrfToken"\s*:\s*")([^"]+)(")/gi, (_match, prefix, token, suffix) => `${prefix}${maskValue(token)}${suffix}`)
        .replace(/(<meta\s+name=["']_csrf["']\s+content=["'])([^"']+)(["'])/gi, (_match, prefix, token, suffix) => `${prefix}${maskValue(token)}${suffix}`)
        .replace(/(name=["']_csrf["']\s+value=["'])([^"']+)(["'])/gi, (_match, prefix, token, suffix) => `${prefix}${maskValue(token)}${suffix}`)
        .replace(/(password=)([^&"'\s]+)/gi, "$1***");

const redact = (value: unknown): unknown => {
    if (typeof value === "string") {
        const redacted = redactString(value);
        return redacted.length > maxResponseChars
            ? `${redacted.slice(0, maxResponseChars)}\n... [truncated]`
            : redacted;
    }

    if (Array.isArray(value)) {
        return value.map(redact);
    }

    if (value && typeof value === "object") {
        const result: Record<string, unknown> = {};

        for (const [key, nestedValue] of Object.entries(value)) {
            const lowerKey = key.toLowerCase();

            if (
                lowerKey.includes("password") ||
                lowerKey.includes("cookie") ||
                lowerKey.includes("csrf") ||
                lowerKey.includes("authorization")
            ) {
                result[key] =
                    typeof nestedValue === "string" ? maskValue(nestedValue) : "***";
                continue;
            }

            result[key] = redact(nestedValue);
        }

        return result;
    }

    return value;
};

const writeLog = (entry: LogEntry) => {
    mkdirSync(dirname(logFilePath), { recursive: true });
    appendFileSync(logFilePath, `${JSON.stringify(redact(entry))}\n`, {
        mode: 0o600,
    });
};

const logActivity = (event: string, details?: unknown, level: LogLevel = "info") => {
    writeLog({
        timestamp: new Date().toISOString(),
        level,
        event,
        details,
    });
};

const logApiCall = (details: {
    label: string;
    request: {
        method: string;
        url: string;
        headers?: Record<string, string>;
        params?: Record<string, string>;
        body?: string;
    };
    response?: {
        status: number;
        headers?: Record<string, string>;
        body?: string;
    };
    error?: string;
}) => {
    logActivity(details.error ? "api-call-failed" : "api-call", details, details.error ? "error" : "info");
};

module.exports = {
    logActivity,
    logApiCall,
};
