const { clockOut } = require("../api/attendanceApi");
const { printTmsActionResult } = require("../utils/console");

module.exports = {
    clockOut,
};

const isDirectRun = process.argv[1]?.endsWith("clockOut.ts");

if (isDirectRun) {
    clockOut()
        .then(printTmsActionResult)
        .catch((error: unknown) => {
            console.error("Clock-out failed:", error);
            process.exitCode = 1;
        });
}
