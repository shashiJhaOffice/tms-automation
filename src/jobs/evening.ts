const { clockOut } = require("../api/attendanceApi");
const { callFillWorkSheetAPI } = require("../api/worksheetApi");
const { printTmsActionResult } = require("../utils/console");
const { formatDate } = require("../utils/date");
const { updateDayState } = require("../utils/state");
const { logActivity } = require("../utils/logger");

const runEveningJob = async () => {
    const worksheetDate = process.env.WORKSHEET_DATE ?? formatDate(new Date());

    logActivity("evening-job-started", { worksheetDate });

    const clockOutResult = await clockOut();
    printTmsActionResult(clockOutResult);
    updateDayState(worksheetDate, (current: any) => ({
        ...current,
        status: "clocked-out",
        clockOutAt: new Date().toISOString(),
    }));

    const worksheetResults = await callFillWorkSheetAPI({
        startDate: worksheetDate,
        endDate: worksheetDate,
    });
    updateDayState(worksheetDate, (current: any) => ({
        ...current,
        status: "completed",
        worksheetSubmittedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
    }));

    logActivity("evening-job-completed", {
        worksheetDate,
        worksheetCount: worksheetResults.length,
    });

    return {
        clockOut: clockOutResult,
        worksheet: worksheetResults,
    };
};

module.exports = {
    runEveningJob,
};

const isDirectRun = process.argv[1]?.endsWith("evening.ts");

if (isDirectRun) {
    runEveningJob()
        .then(() => {
            console.log("Evening job completed.");
        })
        .catch((error: unknown) => {
            console.error("Evening job failed:", error);
            process.exitCode = 1;
        });
}
