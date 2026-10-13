const { callFillWorkSheetAPI } = require("../api/worksheetApi");
const { printWorksheetResult } = require("../utils/console");

module.exports = {
    callFillWorkSheetAPI,
};

const isDirectRun = process.argv[1]?.endsWith("fillWorksheet.ts");

if (isDirectRun) {
    const startDate = process.env.WORKSHEET_START_DATE;
    const endDate = process.env.WORKSHEET_END_DATE;

    if (!startDate || !endDate) {
        throw new Error(
            "Set WORKSHEET_START_DATE and WORKSHEET_END_DATE before running worksheet"
        );
    }

    callFillWorkSheetAPI({ startDate, endDate })
        .then((results: any[]) => {
            console.log(`Filled worksheet for ${results.length} date(s).`);
            for (const result of results) {
                printWorksheetResult(result);
            }
        })
        .catch((error: unknown) => {
            console.error("Error calling fillWorksheet API:", error);
            process.exitCode = 1;
        });
}
