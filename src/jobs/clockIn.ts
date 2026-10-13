const { clockIn } = require("../api/attendanceApi");
const { printTmsActionResult } = require("../utils/console");

module.exports = {
    clockIn,
};

const isDirectRun = process.argv[1]?.endsWith("clockIn.ts");

if (isDirectRun) {
    clockIn()
        .then(printTmsActionResult)
        .catch((error: unknown) => {
            console.error("Clock-in failed:", error);
            process.exitCode = 1;
        });
}
