const { execFile } = require("child_process");
const { promisify } = require("util");
const { config } = require("dotenv");
const { clockIn } = require("../api/attendanceApi");
const { runEveningJob } = require("./evening");
const { printTmsActionResult } = require("../utils/console");
const { formatDate } = require("../utils/date");
const { getDayState, updateDayState } = require("../utils/state");
const { logActivity } = require("../utils/logger");

config({ path: "src/.env" });

const execFileAsync = promisify(execFile);

const hasPromptCompletedToday = () => {
    const state = getDayState();
    return ["clocked-in", "skipped", "clocked-out", "completed"].includes(
        state.status ?? ""
    );
};

const getClockOutDelayMs = () => {
    const hours = Number(process.env.TMS_AUTO_CLOCKOUT_AFTER_HOURS ?? 9.5);
    return hours * 60 * 60 * 1000;
};

const isWeekday = () => {
    const day = new Date().getDay();
    return day >= 1 && day <= 5;
};

const escapeAppleScriptString = (value: string) =>
    value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const showClockInDialog = async () => {
    const title = process.env.TMS_CLOCKIN_PROMPT_TITLE ?? "TMS Wake-Up Call";
    const message =
        process.env.TMS_CLOCKIN_PROMPT_MESSAGE ??
        "Your laptop is awake. Your TMS login button is also awake. Coincidence? Probably not. Clock in before future-you opens a spreadsheet with dramatic background music.";

    const script = `
tell application "System Events"
  activate
  set dialogResult to display dialog "${escapeAppleScriptString(message)}" buttons {"Skip today", "Later", "Clock me in"} default button "Clock me in" cancel button "Skip today" with title "${escapeAppleScriptString(title)}" giving up after 120
  return button returned of dialogResult
end tell
`;

    try {
        const { stdout } = await execFileAsync("osascript", ["-e", script]);
        return stdout.trim();
    } catch (error: any) {
        if (error.stdout?.includes("Skip today") || error.message?.includes("-128")) {
            return "Skip today";
        }

        throw error;
    }
};

const notify = async (title: string, message: string) => {
    const script = `display notification "${escapeAppleScriptString(
        message
    )}" with title "${escapeAppleScriptString(title)}"`;
    await execFileAsync("osascript", ["-e", script]);
};

const processDueClockOut = async () => {
    const date = formatDate(new Date());
    const state = getDayState(date);

    if (state.status !== "clocked-in" || !state.clockOutDueAt) {
        return false;
    }

    const clockOutAt = new Date(state.clockOutDueAt);

    if (Number.isNaN(clockOutAt.getTime()) || clockOutAt > new Date()) {
        return false;
    }

    logActivity("auto-evening-started", {
        date: state.date,
        clockInAt: state.clockInAt,
        clockOutDueAt: state.clockOutDueAt,
    });

    await notify(
        "TMS Auto Flow",
        "9.5 hours are done. Clocking out and filling worksheet now."
    );

    await runEveningJob();

    logActivity("auto-evening-completed", {
        date: state.date,
        completedAt: new Date().toISOString(),
    });

    await notify(
        "TMS Auto Flow",
        "Clock-out and worksheet are done. The boring part has left the building."
    );

    return true;
};

const runWakeClockInPrompt = async () => {
    logActivity("wake-prompt-run-started");

    if (await processDueClockOut()) {
        return;
    }

    if (process.env.TMS_CLOCKIN_PROMPT_WEEKDAYS_ONLY !== "false" && !isWeekday()) {
        logActivity("wake-prompt-skipped-weekend");
        return;
    }

    if (process.env.TMS_CLOCKIN_PROMPT_ONCE_PER_DAY !== "false" && hasPromptCompletedToday()) {
        logActivity("wake-prompt-skipped-already-handled");
        return;
    }

    logActivity("wake-prompt-dialog-shown");
    const choice = await showClockInDialog();
    logActivity("wake-prompt-choice", { choice });

    if (choice === "Clock me in") {
        const result = await clockIn();
        printTmsActionResult(result);
        const now = new Date();
        const clockOutAt = new Date(now.getTime() + getClockOutDelayMs());
        const date = formatDate(now);
        updateDayState(date, (current: any) => ({
            ...current,
            date,
            status: "clocked-in",
            promptAction: "clocked-in",
            promptAt: now.toISOString(),
            clockInAt: now.toISOString(),
            clockOutDueAt: clockOutAt.toISOString(),
        }));
        logActivity("wake-prompt-clockin-completed", {
            clockInAt: now.toISOString(),
            clockOutDueAt: clockOutAt.toISOString(),
        });
        await notify(
            "TMS Clock-In",
            `Done. Clock-out + worksheet is queued for ${clockOutAt.toLocaleTimeString()}.`
        );
        return;
    }

    if (choice === "Skip today") {
        const now = new Date();
        const date = formatDate(now);
        updateDayState(date, (current: any) => ({
            ...current,
            date,
            status: "skipped",
            promptAction: "skipped",
            promptAt: now.toISOString(),
        }));
        logActivity("wake-prompt-skipped-by-user");
    }
};

module.exports = {
    runWakeClockInPrompt,
};

const isDirectRun = process.argv[1]?.endsWith("wakeClockInPrompt.ts");

if (isDirectRun) {
    runWakeClockInPrompt().catch((error: unknown) => {
        console.error("Wake clock-in prompt failed:", error);
        process.exitCode = 1;
    });
}
