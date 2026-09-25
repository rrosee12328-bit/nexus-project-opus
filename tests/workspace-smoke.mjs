// Offline UI verification: every external HTTP request and WebSocket is intercepted.
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const origin = "http://127.0.0.1:8107";
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "8107", "--strictPort"], { stdio: "ignore" });
let browser;
try {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  await mkdir("/tmp/vektiss-workspace-smoke", { recursive: true });
  for (const [role, width] of ["client", "admin"].flatMap(role => [375, 390, 768, 1440].map(width => [role, width]))) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block" });
    await context.routeWebSocket("**/*", socket => socket.close());
    const unexpectedWrites = [];
    await context.route("**/*", async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin === origin) return route.continue();
      if (!url.hostname.endsWith("supabase.co")) return route.abort();
      const table = url.pathname.split("/").pop();
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method()) && !url.pathname.includes("/rpc/")) unexpectedWrites.push(url.pathname);
      let data = [];
      if (table === "get_user_role") data = role;
      if (table === "user_roles") data = [{ role, user_id: "22222222-2222-4222-8222-222222222222" }];
      if (table === "get_client_id_for_user") data = "11111111-1111-4111-8111-111111111111";
      if (table === "profiles") data = { display_name: "Test Client", avatar_url: null };
      if (table === "clients") {
        const client = { id: "11111111-1111-4111-8111-111111111111", name: "Test Client", status: "active", setup_fee: 1500, setup_paid: 1500, balance_due: 0, monthly_fee: 300, created_at: "2026-09-01T12:00:00Z", user_id: null };
        data = request.headers().accept?.includes("object") ? client : [client];
      }
      if (table === "onboarding_sessions") data = null;
      await route.fulfill({ status: 200, contentType: "application/json", headers: { "content-range": "*/0" }, body: JSON.stringify(data) });
    });
    await context.addInitScript(() => {
      const payload = btoa(JSON.stringify({ sub: "22222222-2222-4222-8222-222222222222", exp: 4102444800, role: "authenticated" }));
      const session = { access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.test`, refresh_token: "offline-test", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "22222222-2222-4222-8222-222222222222", email: "test@example.invalid", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} } };
      localStorage.setItem("sb-ogcgqbrewfzkchwqrrxj-auth-token", JSON.stringify(session));
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${origin}${role === "client" ? "/portal" : "/admin/clients/11111111-1111-4111-8111-111111111111"}`);
    await page.getByText(role === "client" ? "Your brief" : "Client journey", { exact: true }).waitFor();
    await page.screenshot({ path: `/tmp/vektiss-workspace-smoke/${role}-${width}.png`, fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, `Page overflow at ${width}px`);
    if (width < 768) {
      await page.setViewportSize({ width, height: 480 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "Keyboard-sized viewport overflow");
    }
    assert.deepEqual(errors, [], "Browser errors");
    assert.deepEqual(unexpectedWrites, [], "Rendering must not write business data");
    await context.close();
    console.log(`PASS ${role} workspace ${width}px; external delivery blocked`);
  }
} finally {
  await browser?.close();
  server.kill();
}
