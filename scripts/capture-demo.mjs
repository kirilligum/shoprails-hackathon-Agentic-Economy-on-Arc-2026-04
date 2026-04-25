import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";

const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const port = 9340;
const profile = `${process.cwd()}/artifacts/edge-demo-capture-profile`;
const output = `${process.cwd()}/artifacts/shoprails-demo-backup.png`;

await mkdir(profile, { recursive: true });

const browser = spawn(edge, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  "--window-size=1440,1300",
  "about:blank"
], { stdio: "ignore" });

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCdp() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {
      // Retry while Edge starts.
    }
    await sleep(250);
  }
  throw new Error("Edge CDP did not start.");
}

let ws;
try {
  await waitForCdp();
  const page = await (await fetch(`http://127.0.0.1:${port}/json/new?http://localhost:4173/`, { method: "PUT" })).json();
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });

  function send(method, params = {}) {
    const requestId = ++id;
    ws.send(JSON.stringify({ id: requestId, method, params }));
    return new Promise((resolve, reject) => pending.set(requestId, { resolve, reject }));
  }

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1300,
    deviceScaleFactor: 1,
    mobile: false
  });
  await sleep(1600);
  await send("Runtime.evaluate", {
    expression: `([...document.querySelectorAll('button')].find((button) => button.textContent.includes('Run perfect hackathon demo')) || {}).click()`
  });

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await send("Runtime.evaluate", {
      expression: `document.body.innerText.includes('Perfect demo loaded') && document.body.innerText.includes('Real x402 nanopayment')`,
      returnByValue: true
    });
    if (result.result.value) break;
    await sleep(500);
  }

  const screenshot = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false
  });
  await writeFile(output, Buffer.from(screenshot.data, "base64"));
  console.log(output);
} finally {
  try {
    ws?.close();
  } catch {
    // Best effort cleanup.
  }
  browser.kill();
}
