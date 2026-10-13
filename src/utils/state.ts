const { existsSync, readFileSync, writeFileSync } = require("fs");
const { resolve } = require("path");
const { config } = require("dotenv");
const { formatDate } = require("./date");

config({ path: "src/.env" });

type DayState = {
    date: string;
    status?:
        | "idle"
        | "clocked-in"
        | "skipped"
        | "clocked-out"
        | "worksheet-submitted"
        | "completed";
    promptAction?: "clocked-in" | "skipped" | "completed";
    promptAt?: string;
    clockInAt?: string;
    clockOutDueAt?: string;
    clockOutAt?: string;
    worksheetSubmittedAt?: string;
    completedAt?: string;
};

type AutomationState = {
    days: Record<string, DayState>;
};

const stateFilePath = resolve(process.env.TMS_STATE_FILE ?? ".tms-state.json");

const emptyState = (): AutomationState => ({
    days: {},
});

const readState = (): AutomationState => {
    if (!existsSync(stateFilePath)) {
        return emptyState();
    }

    try {
        return JSON.parse(readFileSync(stateFilePath, "utf8")) as AutomationState;
    } catch {
        return emptyState();
    }
};

const writeState = (state: AutomationState) => {
    writeFileSync(stateFilePath, `${JSON.stringify(state, null, 2)}\n`, {
        mode: 0o600,
    });
};

const getDayState = (date = formatDate(new Date())) => {
    const state = readState();
    return state.days[date] ?? { date, status: "idle" };
};

const updateDayState = (
    date: string,
    updater: (current: DayState) => DayState
) => {
    const state = readState();
    const current = state.days[date] ?? { date, status: "idle" };
    const next = updater(current);

    state.days[date] = next;
    writeState(state);

    return next;
};

module.exports = {
    getDayState,
    readState,
    updateDayState,
    writeState,
};
