import { spawn } from "node:child_process";

const [, , profile, ...commandParts] = process.argv;

if (!profile || commandParts.length === 0) {
  console.error(
    "Usage: node scripts/run-with-profile.mjs <profile> <command> [args...]"
  );
  process.exit(1);
}

const [command, ...args] = commandParts;

const child = spawn(command, args, {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    VITE_DEPLOY_PROFILE: profile,
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
