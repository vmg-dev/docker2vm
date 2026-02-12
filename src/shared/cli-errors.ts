export class CliUsageError extends Error {
  constructor(
    message: string,
    public readonly hints: string[] = []
  ) {
    super(message);
    this.name = "CliUsageError";
  }
}

export class CliHelpRequested extends Error {
  constructor() {
    super("help requested");
    this.name = "CliHelpRequested";
  }
}

export class NotImplementedYetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotImplementedYetError";
  }
}
