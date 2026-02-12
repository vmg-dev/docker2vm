import { parseDockerfile2GondolinArgs } from "../dockerfile2gondolin/cli/args";
import { dockerfile2GondolinUsage } from "../dockerfile2gondolin/cli/usage";
import { buildDockerfileWrapperPlan } from "../dockerfile2gondolin/pipeline/plan";
import { executeDockerfileWrapper } from "../dockerfile2gondolin/pipeline/execute";
import { CliHelpRequested, CliUsageError } from "../shared/cli-errors";
import { renderCliError } from "../shared/render-cli-error";

export async function runDockerfile2Gondolin(argv: string[]): Promise<number> {
  try {
    const options = parseDockerfile2GondolinArgs(argv);

    if (options.dryRun) {
      const plan = buildDockerfileWrapperPlan(options);
      console.log(JSON.stringify(plan, null, 2));
      return 0;
    }

    const result = await executeDockerfileWrapper(options);
    console.log(JSON.stringify(result, null, 2));
    return 0;
  } catch (error) {
    if (error instanceof CliHelpRequested) {
      console.log(dockerfile2GondolinUsage());
      return 0;
    }

    console.error(renderCliError(error));

    if (error instanceof CliUsageError) {
      console.error("\n" + dockerfile2GondolinUsage());
    }

    return 1;
  }
}
