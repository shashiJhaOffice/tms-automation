const { runWakeClockInPrompt } = require("./wakeClockInPrompt");
const { logActivity } = require("../utils/logger");

const runOrchestrator = async () => {
    logActivity("orchestrator-started");
    await runWakeClockInPrompt();
    logActivity("orchestrator-completed");
};

module.exports = {
    runOrchestrator,
};

const isDirectRun = process.argv[1]?.endsWith("orchestrator.ts");

if (isDirectRun) {
    runOrchestrator().catch((error: unknown) => {
        console.error("TMS orchestrator failed:", error);
        process.exitCode = 1;
    });
}
