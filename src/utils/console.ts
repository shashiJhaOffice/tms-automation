type PrintableApiResult = {
    action: string;
    url: string;
    status: number;
    payload: Record<string, string>;
    encodedPayload: string;
    response: string;
};

type PrintableWorksheetResult = {
    date: string;
    status: number;
    mode: "save" | "update";
    payload: Record<string, string>;
    encodedPayload: string;
    result: unknown;
};

const stringifyForConsole = (value: unknown) => {
    if (typeof value === "string") {
        return value;
    }

    return JSON.stringify(value, null, 2);
};

const printTmsActionResult = (result: PrintableApiResult) => {
    const line = "=".repeat(78);
    const thinLine = "-".repeat(78);
    const statusLabel = result.status >= 200 && result.status < 300 ? "OK" : "ERR";

    console.log("");
    console.log(`+${line}+`);
    console.log(
        `| ${result.action.toUpperCase()} | ${statusLabel} ${result.status} | ${result.url}`.padEnd(79) +
            "|"
    );
    console.log(`+${thinLine}+`);
    console.log("| Payload".padEnd(79) + "|");
    console.log(`+${thinLine}+`);
    console.table(result.payload);
    console.log("Encoded payload:");
    console.log(result.encodedPayload);
    console.log("");
    console.log("Response:");
    console.log(stringifyForConsole(result.response));
    console.log(`+${line}+`);
};

const printWorksheetResult = (result: PrintableWorksheetResult) => {
    const line = "═".repeat(78);
    const thinLine = "─".repeat(78);
    const statusIcon = result.status >= 200 && result.status < 300 ? "OK" : "ERR";

    console.log("");
    console.log(`╔${line}╗`);
    console.log(
        `║ Worksheet ${result.mode.toUpperCase()} | ${result.date} | ${statusIcon} ${result.status}`.padEnd(79) +
            "║"
    );
    console.log(`╠${thinLine}╣`);
    console.log("║ Payload".padEnd(79) + "║");
    console.log(`╚${thinLine}╝`);
    console.table(result.payload);
    console.log("Encoded payload:");
    console.log(result.encodedPayload);
    console.log("");
    console.log("Response:");
    console.log(stringifyForConsole(result.result));
    console.log(`╚${line}╝`);
};

module.exports = {
    printTmsActionResult,
    printWorksheetResult,
    stringifyForConsole,
};
