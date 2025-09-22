import { buildApplication } from "./composition/container";
import { initializeLogging } from "./logging";
import { LOG_FILE } from "./env";

async function main() {
  const loggingHandle = initializeLogging(LOG_FILE);
  if (loggingHandle.logPath) {
    console.log(`Logging output to ${loggingHandle.logPath}`);
  }

  const app = await buildApplication();
  await app.start();

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await app.shutdown?.();
    } catch (err) {
      console.warn("Shutdown failed:", err);
    }
  };

  process.on("SIGINT", () => {
    console.log("\nExiting…");
    loggingHandle.shutdown();
    shutdown().finally(() => process.exit(0));
  });

  process.on("exit", () => {
    loggingHandle.shutdown();
    shutdown().catch(() => {});
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
