const { existsSync, readFileSync, writeFileSync } = require("fs");
const { resolve } = require("path");
const { config } = require("dotenv");
const { logActivity, logApiCall } = require("../utils/logger");

config({ path: "src/.env" });

type TmsSession = {
    cookie: string;
    csrfToken: string;
    savedAt: string;
};

type TmsActionResult = {
    action: string;
    url: string;
    status: number;
    payload: Record<string, string>;
    encodedPayload: string;
    response: string;
};

const sessionFilePath = resolve(
    process.env.TMS_SESSION_FILE ?? ".tms-session.json"
);

const requiredEnv = (key: string) => {
    const value = process.env[key];

    if (!value) {
        throw new Error(`Missing required env variable: ${key}`);
    }

    return value;
};

const getBaseUrl = () => process.env.TMS_BASE_URL ?? "https://tms.tataaia.com";

const buildTmsUrl = (path: string) => {
    if (path.startsWith("http")) {
        return path;
    }

    return `${getBaseUrl()}${path}`;
};

const getLoginUrl = () =>
    buildTmsUrl(process.env.TMS_LOGIN_URL ?? "/TMS/login?module=TMS");

const getLoginActionUrl = () =>
    buildTmsUrl(
        process.env.TMS_LOGIN_ACTION_URL ?? "/TMS/j_spring_security_check"
    );

const getLoginSuccessUrl = () =>
    buildTmsUrl(process.env.TMS_LOGIN_SUCCESS_URL ?? "/TMS/loginSuccess");

const getDashboardUrl = () =>
    buildTmsUrl(process.env.TMS_DASHBOARD_URL ?? "/TMS/tms/tmsDashboard");

const getUserAgent = () =>
    process.env.TMS_USER_AGENT ??
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0";

const getBrowserHeaders = () => ({
    "Accept-Language":
        process.env.TMS_ACCEPT_LANGUAGE ??
        "en-IN,en-GB;q=0.9,en;q=0.8,en-US;q=0.7",
    "Cache-Control": "max-age=0",
    Connection: "keep-alive",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "sec-ch-ua":
        process.env.TMS_SEC_CH_UA ??
        '"Microsoft Edge";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
    "sec-ch-ua-mobile": process.env.TMS_SEC_CH_UA_MOBILE ?? "?0",
    "sec-ch-ua-platform": process.env.TMS_SEC_CH_UA_PLATFORM ?? '"macOS"',
});

const headersToObject = (headers: Headers) => {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
        result[key] = value;
    });
    return result;
};

const parseCookieHeader = (cookieHeader = "") => {
    const cookies = new Map<string, string>();

    for (const cookie of cookieHeader.split(";")) {
        const trimmed = cookie.trim();

        if (!trimmed) {
            continue;
        }

        const separatorIndex = trimmed.indexOf("=");

        if (separatorIndex === -1) {
            continue;
        }

        cookies.set(
            trimmed.slice(0, separatorIndex),
            trimmed.slice(separatorIndex + 1)
        );
    }

    return cookies;
};

const serializeCookies = (cookies: Map<string, string>) =>
    Array.from(cookies.entries())
        .map(([key, value]) => `${key}=${value}`)
        .join("; ");

const splitSetCookieHeader = (header: string) =>
    header.split(/,(?=\s*[^;,]+=)/).map((cookie) => cookie.trim());

const getSetCookieHeaders = (response: Response) => {
    const headers = response.headers as unknown as {
        getSetCookie?: () => string[];
        raw?: () => Record<string, string[]>;
    };

    if (typeof headers.getSetCookie === "function") {
        return headers.getSetCookie();
    }

    const rawSetCookie = headers.raw?.()["set-cookie"];

    if (rawSetCookie) {
        return rawSetCookie;
    }

    const setCookie = response.headers.get("set-cookie");
    return setCookie ? splitSetCookieHeader(setCookie) : [];
};

const mergeSetCookies = (cookieHeader: string, setCookieHeaders: string[]) => {
    const cookies = parseCookieHeader(cookieHeader);

    for (const setCookie of setCookieHeaders) {
        const [cookiePair] = setCookie.split(";");
        if (!cookiePair) {
            continue;
        }

        const separatorIndex = cookiePair.indexOf("=");

        if (separatorIndex === -1) {
            continue;
        }

        cookies.set(
            cookiePair.slice(0, separatorIndex).trim(),
            cookiePair.slice(separatorIndex + 1).trim()
        );
    }

    return serializeCookies(cookies);
};

const extractCsrfToken = (html: string) => {
    const metaMatch = html.match(
        /<meta\s+name=["']_csrf["']\s+content=["']([^"']+)["']/i
    );

    if (metaMatch?.[1]) {
        return metaMatch[1];
    }

    const inputMatch = html.match(
        /name=["']_csrf["']\s+value=["']([^"']+)["']/i
    );

    if (inputMatch?.[1]) {
        return inputMatch[1];
    }

    throw new Error("CSRF token not found in HTML");
};

const readStoredSession = (): TmsSession | null => {
    if (!existsSync(sessionFilePath)) {
        return null;
    }

    try {
        return JSON.parse(readFileSync(sessionFilePath, "utf8")) as TmsSession;
    } catch {
        return null;
    }
};

const writeStoredSession = (session: TmsSession) => {
    writeFileSync(sessionFilePath, `${JSON.stringify(session, null, 2)}\n`, {
        mode: 0o600,
    });
};

const isLoginPage = (html: string) =>
    html.includes("j_spring_security_check") ||
    /name=["']ntid["']/i.test(html) ||
    /name=["']password["']/i.test(html);

const fetchTextWithCookie = async (
    url: string,
    cookie: string,
    referer = url,
    label = "fetch-html"
) => {
    const headers = {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        ...getBrowserHeaders(),
        Cookie: cookie,
        Referer: referer,
        "User-Agent": getUserAgent(),
    };
    const response = await fetch(url, {
        method: "GET",
        redirect: "manual",
        headers,
    });
    const updatedCookie = mergeSetCookies(cookie, getSetCookieHeaders(response));
    const html = await response.text();

    logApiCall({
        label,
        request: {
            method: "GET",
            url,
            headers,
        },
        response: {
            status: response.status,
            headers: headersToObject(response.headers),
            body: html,
        },
    });

    return {
        response,
        cookie: updatedCookie,
        html,
    };
};

const isRedirectStatus = (status: number) =>
    [301, 302, 303, 307, 308].includes(status);

const getRedirectUrl = (response: Response) => {
    const location = response.headers.get("location");

    if (!location) {
        return null;
    }

    return buildTmsUrl(location);
};

const fetchDashboardWithCookie = async (cookie: string) => {
    let result = await fetchTextWithCookie(
        getDashboardUrl(),
        cookie,
        getDashboardUrl(),
        "dashboard"
    );
    let redirectCount = 0;

    while (isRedirectStatus(result.response.status) && redirectCount < 5) {
        const redirectUrl = getRedirectUrl(result.response);

        if (!redirectUrl) {
            break;
        }

        result = await fetchTextWithCookie(
            redirectUrl,
            result.cookie,
            getDashboardUrl(),
            "dashboard-redirect"
        );
        redirectCount += 1;
    }

    if (!result.response.ok) {
        throw new Error(`Dashboard fetch failed: ${result.response.status}`);
    }

    if (isLoginPage(result.html)) {
        throw new Error("Session expired; dashboard returned login page");
    }

    return result;
};

const login = async (): Promise<TmsSession> => {
    const ntid = requiredEnv("TMS_NTID");
    const password = requiredEnv("TMS_PASSWORD");
    let cookie = process.env.TMS_COOKIE ?? "";

    logActivity("login-started", { ntid });

    const loginPage = await fetchTextWithCookie(
        getLoginUrl(),
        cookie,
        getLoginUrl(),
        "login-page"
    );
    cookie = loginPage.cookie;
    const loginCsrfToken = extractCsrfToken(loginPage.html);
    const loginPayloadData = {
        module: process.env.TMS_LOGIN_MODULE ?? "TMS",
        _csrf: loginCsrfToken,
        ntid,
        password,
    };
    const loginPayload = new URLSearchParams(loginPayloadData).toString();
    const loginHeaders = {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        ...getBrowserHeaders(),
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: getBaseUrl(),
        Referer: getLoginUrl(),
        Cookie: cookie,
        "User-Agent": getUserAgent(),
    };

    const loginResponse = await fetch(getLoginActionUrl(), {
        method: "POST",
        redirect: "manual",
        headers: loginHeaders,
        body: loginPayload,
    });
    cookie = mergeSetCookies(cookie, getSetCookieHeaders(loginResponse));

    if (![200, 302, 303].includes(loginResponse.status)) {
        const body = await loginResponse.text();
        logApiCall({
            label: "login-submit",
            request: {
                method: "POST",
                url: getLoginActionUrl(),
                headers: loginHeaders,
                params: loginPayloadData,
                body: loginPayload,
            },
            response: {
                status: loginResponse.status,
                headers: headersToObject(loginResponse.headers),
                body,
            },
            error: `Login failed: ${loginResponse.status}`,
        });
        throw new Error(`Login failed: ${loginResponse.status}. Response: ${body}`);
    }

    logApiCall({
        label: "login-submit",
        request: {
            method: "POST",
            url: getLoginActionUrl(),
            headers: loginHeaders,
            params: loginPayloadData,
            body: loginPayload,
        },
        response: {
            status: loginResponse.status,
            headers: headersToObject(loginResponse.headers),
        },
    });

    const location = loginResponse.headers.get("location");
    if (location?.includes("error=true")) {
        logActivity(
            "login-rejected",
            {
                location,
                reason:
                    "TMS redirected to login?error=true. Check TMS_NTID and TMS_PASSWORD in src/.env.",
            },
            "error"
        );
        throw new Error(
            "TMS login rejected the credentials. Check TMS_NTID and TMS_PASSWORD in src/.env."
        );
    }

    const afterLoginUrl = location ? buildTmsUrl(location) : getLoginSuccessUrl();
    const loginSuccess = await fetchTextWithCookie(
        afterLoginUrl,
        cookie,
        getLoginUrl(),
        "login-success"
    );
    cookie = loginSuccess.cookie;

    if (isLoginPage(loginSuccess.html)) {
        logActivity(
            "login-rejected",
            {
                location: afterLoginUrl,
                reason: "Login success step returned the login page.",
            },
            "error"
        );
        throw new Error(
            "TMS login returned the login page. Check TMS_NTID and TMS_PASSWORD in src/.env."
        );
    }

    const dashboard = await fetchDashboardWithCookie(cookie);
    cookie = dashboard.cookie;

    const session = {
        cookie,
        csrfToken: extractCsrfToken(dashboard.html),
        savedAt: new Date().toISOString(),
    };

    writeStoredSession(session);
    logActivity("login-completed", {
        savedAt: session.savedAt,
        sessionFilePath,
    });
    return session;
};

const getSession = async (forceLogin = false): Promise<TmsSession> => {
    if (!forceLogin) {
        const storedSession = readStoredSession();

        if (storedSession?.cookie) {
            try {
                logActivity("session-reuse-attempted", {
                    sessionFilePath,
                    forceLogin,
                });
                const dashboard = await fetchDashboardWithCookie(storedSession.cookie);
                const session = {
                    cookie: dashboard.cookie,
                    csrfToken: extractCsrfToken(dashboard.html),
                    savedAt: new Date().toISOString(),
                };

                writeStoredSession(session);
                logActivity("session-reused", { savedAt: session.savedAt });
                return session;
            } catch (error) {
                logActivity(
                    "session-reuse-failed",
                    { error: error instanceof Error ? error.message : String(error) },
                    "warn"
                );
                // Fall through to login and refresh the session silently.
            }
        }
    }

    return login();
};

const getFreshCsrfToken = async () => {
    const session = await getSession();
    return session.csrfToken;
};

const shouldRefreshSession = (message: string) =>
    message.includes("CSRF") ||
    message.includes("Session expired") ||
    message.includes("j_spring_security_check") ||
    message.includes('name="ntid"') ||
    message.includes("name='ntid'") ||
    message.includes('name="password"') ||
    message.includes("name='password'") ||
    message.includes("403") ||
    message.includes("401");

const runWithSessionRetry = async <T>(
    action: (session: TmsSession) => Promise<T>
) => {
    const session = await getSession();

    try {
        return await action(session);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (shouldRefreshSession(message)) {
            logActivity("session-refresh-triggered", { reason: message }, "warn");
            const refreshedSession = await getSession(true);
            return action(refreshedSession);
        }

        throw error;
    }
};

const postTmsFormAction = async (
    action: string,
    url: string,
    payloadFactory: Record<string, string> | ((session: TmsSession) => Record<string, string>),
    referer = getDashboardUrl()
): Promise<TmsActionResult> =>
    runWithSessionRetry(async (session) => {
        const payload =
            typeof payloadFactory === "function"
                ? payloadFactory(session)
                : payloadFactory;
        const encodedPayload = new URLSearchParams(payload).toString();
        const headers = {
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Content-Type": "application/x-www-form-urlencoded",
            Origin: getBaseUrl(),
            Referer: referer,
            Cookie: session.cookie,
            "User-Agent": getUserAgent(),
        };
        const response = await fetch(url, {
            method: "POST",
            redirect: "manual",
            headers,
            body: encodedPayload,
        });

        const responseText = await response.text();

        if (!response.ok || isLoginPage(responseText)) {
            logApiCall({
                label: action,
                request: {
                    method: "POST",
                    url,
                    headers,
                    params: payload,
                    body: encodedPayload,
                },
                response: {
                    status: response.status,
                    headers: headersToObject(response.headers),
                    body: responseText,
                },
                error: `${action} failed: ${response.status}`,
            });
            throw new Error(
                `${action} failed: ${response.status}. Response: ${responseText}`
            );
        }

        const updatedSession = {
            ...session,
            cookie: mergeSetCookies(session.cookie, getSetCookieHeaders(response)),
            savedAt: new Date().toISOString(),
        };
        writeStoredSession(updatedSession);

        logApiCall({
            label: action,
            request: {
                method: "POST",
                url,
                headers,
                params: payload,
                body: encodedPayload,
            },
            response: {
                status: response.status,
                headers: headersToObject(response.headers),
                body: responseText,
            },
        });

        return {
            action,
            url,
            status: response.status,
            payload,
            encodedPayload,
            response: responseText,
        };
    });

module.exports = {
    buildTmsUrl,
    getFreshCsrfToken,
    getSession,
    postTmsFormAction,
    runWithSessionRetry,
};
