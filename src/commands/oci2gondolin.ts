import { CliHelpRequested, CliUsageError } from "../shared/cli-errors";
import { renderCliError } from "../shared/render-cli-error";
import { parseOci2GondolinArgs } from "../oci2gondolin/cli/args";
import { oci2GondolinUsage } from "../oci2gondolin/cli/usage";
import { executeConversion } from "../oci2gondolin/pipeline/execute";
import { buildDryRunPlan } from "../oci2gondolin/pipeline/plan";

export async function runOci2Gondolin(argv: string[]): Promise<number> {
  try {
    const options = parseOci2GondolinArgs(argv);

    if (options.dryRun) {
      const plan = buildDryRunPlan(options);
      console.log(JSON.stringify(plan, null, 2));
      return 0;
    }

    const result = await executeConversion(options);
    console.log(JSON.stringify(result, null, 2));
    return 0;
  } catch (error) {
    if (error instanceof CliHelpRequested) {
      console.log(oci2GondolinUsage());
      return 0;
    }

    console.error(renderCliError(error));

    if (error instanceof CliUsageError) {
      console.error("\n" + oci2GondolinUsage());
    }

    return 1;
  }
}
