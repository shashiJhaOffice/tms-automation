const { buildTmsUrl, postTmsFormAction } = require("./tmsClient");

const clockIn = async () => {
    const url = buildTmsUrl(
        process.env.TMS_CLOCK_IN_URL ?? "/TMS/tms/insertLoginTime"
    );

    return postTmsFormAction("clock-in", url, (session: { csrfToken: string }) => ({
        _csrf: session.csrfToken,
    }));
};

const clockOut = async () => {
    const url = buildTmsUrl(
        process.env.TMS_CLOCK_OUT_URL ?? "/TMS/tms/insertLogoutTime"
    );

    return postTmsFormAction("clock-out", url, (session: { csrfToken: string }) => ({
        _csrf: session.csrfToken,
    }));
};

module.exports = {
    clockIn,
    clockOut,
};
