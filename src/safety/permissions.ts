import path from "node:path";

export interface PathGuardrailOptions {
  allowedBaseDir: string;
}

/**
 * Validates that a target path stays strictly inside an allowed base directory.
 * Prevents directory traversal attacks (e.g. "../../../etc/passwd").
 */
export function resolveSafePath(userPath: string, allowedBaseDir: string): string {
  const resolvedBase = path.resolve(allowedBaseDir);
  const resolvedTarget = path.resolve(resolvedBase, userPath);

  // Must start with base directory followed by path separator or be exact base
  if (
    resolvedTarget !== resolvedBase &&
    !resolvedTarget.startsWith(resolvedBase + path.sep)
  ) {
    throw new Error(
      `Access denied: Path "${userPath}" is outside the allowed directory "${allowedBaseDir}".`
    );
  }

  return resolvedTarget;
}
