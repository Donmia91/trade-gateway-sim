/**
 * EOD pipeline CLI: thin wrapper around runEod().
 * Usage:
 *   pnpm eod                    # --config configs/daily.json
 *   pnpm eod:smoke              # --config configs/smoke.json
 *   pnpm eod:ci                 # --config configs/daily.json --ci
 * Options: --config <path>, --seed <number>, --ci, --gates <path>
 */
import path from "path";
import { runEod } from "../src/lib/eod/runEod";

const DEFAULT_CONFIG = "configs/daily.json";
const DEFAULT_GATES_PATH = "configs/ops-gates.json";

function parseArgv(): {
  configPath: string;
  seed: number | null;
  ci: boolean;
  gatesPath: string;
} {
  const args = process.argv.slice(2);
  let configPath = path.join(process.cwd(), DEFAULT_CONFIG);
  let seed: number | null = null;
  let ci = false;
  let gatesPath = path.join(process.cwd(), DEFAULT_GATES_PATH);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--config" && args[i + 1]) {
      configPath = path.isAbsolute(args[i + 1]) ? args[i + 1] : path.join(process.cwd(), args[i + 1]);
      i++;
    } else if (args[i] === "--seed" && args[i + 1]) {
      const n = Number(args[i + 1]);
      if (Number.isFinite(n)) seed = n;
      i++;
    } else if (args[i] === "--ci") {
      ci = true;
    } else if (args[i] === "--gates" && args[i + 1]) {
      gatesPath = path.isAbsolute(args[i + 1]) ? args[i + 1] : path.join(process.cwd(), args[i + 1]);
      i++;
    }
  }
  return { configPath, seed, ci, gatesPath };
}

async function main(): Promise<void> {
  const { configPath, seed, ci, gatesPath } = parseArgv();

  const result = await runEod({
    configPath,
    gatesPath,
    seed: seed ?? undefined,
    ci,
    writeLatest: true,
  });

  if (!ci) {
    console.log(`EOD ${result.status} — runId ${result.runId}`);
    console.log(`Artifacts: ${path.dirname(result.summaryPath)}`);
  }

  process.exit(result.status === "PASS" ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
