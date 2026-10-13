const { getSession } = require("../api/tmsClient");

const maskCookie = (cookie: string) => {
    const jsessionMatch = cookie.match(/JSESSIONID=([^;]+)/);

    if (!jsessionMatch?.[1]) {
        return "JSESSIONID not found";
    }

    const value = jsessionMatch[1];
    return `JSESSIONID=${value.slice(0, 6)}...${value.slice(-4)}`;
};

const isDirectRun = process.argv[1]?.endsWith("login.ts");

if (isDirectRun) {
    getSession(true)
        .then((session: { cookie: string; csrfToken: string; savedAt: string }) => {
            console.log("TMS login/session refresh successful.");
            console.log(`Saved at: ${session.savedAt}`);
            console.log(`Cookie: ${maskCookie(session.cookie)}`);
            console.log(`CSRF: ${session.csrfToken}`);
        })
        .catch((error: unknown) => {
            console.error("TMS login/session refresh failed:", error);
            process.exitCode = 1;
        });
}
