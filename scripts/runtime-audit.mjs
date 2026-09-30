const baseUrl = (process.env.BASE || "https://cabukpos-app.vercel.app").replace(/\/$/, "");

const checks = [
  {
    name: "health",
    path: "/api/health",
    expected: async (response) => {
      const body = await response.json();
      return response.status === 200 && body.ok === true;
    },
    expectedText: "200 + ok=true",
  },
  {
    name: "ready",
    path: "/api/ready",
    expected: async (response) => {
      const body = await response.json();
      return response.status === 200 && body.ok === true && body.checks?.database === "ok";
    },
    expectedText: "200 + database=ok",
  },
  {
    name: "login redirect",
    path: "/yonetim/veriler",
    redirect: "manual",
    expected: async (response) =>
      (response.status === 307 || response.status === 308) &&
      response.headers.get("location")?.includes("/giris"),
    expectedText: "307/308 -> /giris",
  },
  {
    name: "anonymous export protection",
    path: "/api/yonetim/veri-export",
    expected: async (response) => response.status === 401,
    expectedText: "401",
  },
  {
    name: "fiscal cron protection",
    path: "/api/cron/fiscal",
    expected: async (response) => response.status === 401,
    expectedText: "401",
  },
  {
    name: "billing cron protection",
    path: "/api/cron/billing",
    expected: async (response) => response.status === 401,
    expectedText: "401",
  },
  {
    name: "login page",
    path: "/giris",
    expected: async (response) => response.status === 200,
    expectedText: "200",
  },
  {
    name: "registration page",
    path: "/kayit",
    expected: async (response) => response.status === 200,
    expectedText: "200",
  },
];

let failures = 0;
console.log(`Runtime audit: ${baseUrl}`);

for (const check of checks) {
  try {
    const response = await fetch(`${baseUrl}${check.path}`, {
      redirect: check.redirect || "follow",
      headers: { "user-agent": "cabukpos-runtime-audit/1.0" },
    });
    const passed = await check.expected(response);
    if (passed) {
      console.log(`PASS  ${check.name} (${response.status})`);
    } else {
      failures += 1;
      console.error(`FAIL  ${check.name}: expected ${check.expectedText}, got ${response.status}`);
    }
  } catch (error) {
    failures += 1;
    console.error(`FAIL  ${check.name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures > 0) {
  console.error(`Runtime audit failed: ${failures} check(s).`);
  process.exitCode = 1;
} else {
  console.log("Runtime audit passed.");
}
