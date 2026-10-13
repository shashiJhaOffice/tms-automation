const { config } = require("dotenv");
const { runWithSessionRetry } = require("./tmsClient");
const { dateRangeList, formatDate, parseDate } = require("../utils/date");
const { logActivity, logApiCall } = require("../utils/logger");

config({ path: "src/.env" });

type FillWorksheetInput = {
    startDate: string | Date;
    endDate: string | Date;
    mode?: "save" | "update";
    srNo?: string | number;
    workFrom?: string;
    projects?: string;
    projectdesc?: string;
    workType?: string;
    workSubType?: string;
    application?: string;
    hrs?: string | number;
    remarks?: string;
    ticketNo?: string;
};

type FillWorksheetResult = {
    date: string;
    status: number;
    mode: "save" | "update";
    payload: Record<string, string>;
    encodedPayload: string;
    result: unknown;
};

const parseResponse = async (response: Response) => {
    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
        return response.json();
    }

    return response.text();
};

const looksLikeLoginPage = (value: unknown) =>
    typeof value === "string" &&
    (value.includes("j_spring_security_check") ||
        /name=["']ntid["']/i.test(value) ||
        /name=["']password["']/i.test(value));

const getWorksheetMode = (mode?: FillWorksheetInput["mode"]) => {
    const envMode = process.env.TMS_WORKSHEET_MODE;
    const worksheetMode = mode ?? envMode ?? "save";

    if (worksheetMode !== "save" && worksheetMode !== "update") {
        throw new Error('TMS_WORKSHEET_MODE must be either "save" or "update"');
    }

    return worksheetMode;
};

const getWorksheetIdentity = (
    mode: "save" | "update",
    srNo?: FillWorksheetInput["srNo"]
) => {
    if (mode === "save") {
        return {
            flag: "insert",
            srNo: "-1",
        };
    }

    const updateSrNo = srNo ?? process.env.TMS_WORKSHEET_SR_NO;

    if (!updateSrNo) {
        throw new Error("TMS_WORKSHEET_SR_NO is required for update mode");
    }

    return {
        flag: "update",
        srNo: String(updateSrNo),
    };
};

const callFillWorkSheetAPI = async (
    data: FillWorksheetInput
): Promise<FillWorksheetResult[]> => {
    logActivity("worksheet-started", {
        startDate: data.startDate,
        endDate: data.endDate,
        mode: data.mode ?? process.env.TMS_WORKSHEET_MODE ?? "save",
    });

    const saveDetailsUrl =
        process.env.TMS_SAVE_DETAILS_URL ??
        "https://tms.tataaia.com/TMS/tms/saveDetails";

    const datesList = dateRangeList(
        parseDate(data.startDate),
        parseDate(data.endDate)
    );
    const results: FillWorksheetResult[] = [];
    const worksheetMode = getWorksheetMode(data.mode);
    const worksheetIdentity = getWorksheetIdentity(worksheetMode, data.srNo);

    for (const workDate of datesList) {
        const date = formatDate(workDate);
        const worksheetResult = await runWithSessionRetry(
            async (session: { cookie: string; csrfToken: string }) => {
                const payloadData = {
                    flag: worksheetIdentity.flag,
                    srNo: worksheetIdentity.srNo,
                    _csrf: session.csrfToken,
                    Workdate: date,
                    workFrom: data.workFrom ?? "Office",
                    projects: data.projects ?? "SER-341",
                    projectdesc:
                        data.projectdesc ?? "Payment - Petty Cash Denomination UI",
                    workType: data.workType ?? "01",
                    workSubType: data.workSubType ?? "09",
                    application: data.application ?? "Customer Portal",
                    hrs: String(data.hrs ?? "9.0"),
                    remarks:
                        data.remarks ??
                        process.env.TMS_WORKSHEET_REMARKS ??
                        "fixes and enhacements1",
                    ticketNo:
                        data.ticketNo ?? process.env.TMS_WORKSHEET_TICKET_NO ?? "--",
                };
                const payload = new URLSearchParams(payloadData);
                const encodedPayload = payload.toString();
                const headers = {
                    Accept: "*/*",
                    "Content-Type":
                        "application/x-www-form-urlencoded; charset=UTF-8",
                    Origin: "https://tms.tataaia.com",
                    Referer: "https://tms.tataaia.com/TMS/tms/getWorksheetPage",
                    "X-CSRF-TOKEN": session.csrfToken,
                    "X-Requested-With": "XMLHttpRequest",
                    Cookie: session.cookie,
                };

                const response = await fetch(saveDetailsUrl, {
                    method: "POST",
                    headers,
                    body: encodedPayload,
                });

                const result = await parseResponse(response);

                if (!response.ok || looksLikeLoginPage(result)) {
                    logApiCall({
                        label: "worksheet-save-details",
                        request: {
                            method: "POST",
                            url: saveDetailsUrl,
                            headers,
                            params: payloadData,
                            body: encodedPayload,
                        },
                        response: {
                            status: response.status,
                            body:
                                typeof result === "string"
                                    ? result
                                    : JSON.stringify(result),
                        },
                        error: `Worksheet failed for ${date}`,
                    });
                    throw new Error(
                        `Failed to fill worksheet for ${date}. Status: ${response.status}. Response: ${String(
                            result
                        )}`
                    );
                }

                logApiCall({
                    label: "worksheet-save-details",
                    request: {
                        method: "POST",
                        url: saveDetailsUrl,
                        headers,
                        params: payloadData,
                        body: encodedPayload,
                    },
                    response: {
                        status: response.status,
                        body:
                            typeof result === "string" ? result : JSON.stringify(result),
                    },
                });

                return {
                    status: response.status,
                    payload: payloadData,
                    encodedPayload,
                    result,
                };
            }
        );

        results.push({
            date,
            status: worksheetResult.status,
            mode: worksheetMode,
            payload: worksheetResult.payload,
            encodedPayload: worksheetResult.encodedPayload,
            result: worksheetResult.result,
        });
    }

    logActivity("worksheet-completed", {
        count: results.length,
        dates: results.map((result) => result.date),
    });

    return results;
};

module.exports = {
    callFillWorkSheetAPI,
};
