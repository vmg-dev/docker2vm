import { VM } from "@earendil-works/gondolin";

type SandboxOptions = {
  accel?: "kvm" | "hvf" | "tcg";
  cpu?: string;
  machineType?: string;
};

function parseCommand(argv: string[]): string[] {
  const args = argv.slice(2);
  if (args.length === 0) {
    throw new Error("missing command to execute");
  }
  return args;
}

function resolveSandboxOptions(): SandboxOptions | undefined {
  const accel = process.env.GONDOLIN_SMOKE_ACCEL?.trim();
  const cpu = process.env.GONDOLIN_SMOKE_CPU?.trim();
  const machineType = process.env.GONDOLIN_SMOKE_MACHINE?.trim();

  const out: SandboxOptions = {};
  if (accel === "kvm" || accel === "hvf" || accel === "tcg") {
    out.accel = accel;
  }
  if (cpu) {
    out.cpu = cpu;
  }
  if (machineType) {
    out.machineType = machineType;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

async function main() {
  const command = parseCommand(process.argv);
  const sandbox = resolveSandboxOptions();

  let vm: VM | null = null;
  try {
    vm = await VM.create({
      sandbox,
    });

    const result = await vm.exec(command);

    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);

    if (result.signal !== undefined) {
      process.stderr.write(`process exited due to signal ${result.signal}\n`);
      process.exit(1);
    }

    process.exit(result.exitCode);
  } finally {
    if (vm) {
      await vm.close().catch(() => {
        // ignore close errors
      });
    }
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
