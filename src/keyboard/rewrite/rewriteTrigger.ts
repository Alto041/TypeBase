export const REWRITE_COMMAND = '/rewrite';

export function endsWithRewriteCommand(context: string): boolean {
  return context.endsWith(REWRITE_COMMAND);
}

export function stripRewriteCommand(context: string): string {
  if (!endsWithRewriteCommand(context)) {
    return context;
  }
  return context.slice(0, -REWRITE_COMMAND.length);
}
