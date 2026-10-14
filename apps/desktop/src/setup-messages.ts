const checkFailurePrefix = 'FAIL  '
const launcherMessagePrefix = 'offee: '

/**
 * What to tell someone whose setup or start failed, from what the launcher printed. Failed
 * machine checks are listed as they are, since each says what to change; otherwise the
 * launcher's own last word on why it stopped.
 * @param output Everything the launcher printed.
 * @param logFile Where the full log is kept.
 * @returns The message for the settings window.
 */
export const describeFailure = (output: string, logFile: string): string => {
  const lines = output.split('\n').map((line) => line.trim())
  const failedChecks = lines.filter((line) => line.startsWith(checkFailurePrefix)).map((line) => line.slice(checkFailurePrefix.length))
  if (failedChecks.length > 0) return `This Mac is not ready for Offee yet:\n${failedChecks.map((check) => `• ${check}`).join('\n')}`
  const launcherReason = lines.findLast((line) => line.startsWith(launcherMessagePrefix))?.slice(launcherMessagePrefix.length)
  const logHint = `The full log is in ${logFile}.`
  return launcherReason === undefined ? `Something failed. ${logHint}` : `${launcherReason}\n${logHint}`
}
