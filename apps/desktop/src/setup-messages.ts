const checkFailurePrefix = 'FAIL  '

/**
 * What to tell someone whose setup or start failed, from what the launcher printed. Failed
 * machine checks are listed as they are, since each says what to change.
 * @param output Everything the launcher printed.
 * @param logFile Where the full log is kept.
 * @returns The message for the settings window.
 */
export const describeFailure = (output: string, logFile: string): string => {
  const failedChecks = output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith(checkFailurePrefix))
    .map((line) => line.slice(checkFailurePrefix.length))
  if (failedChecks.length > 0) return `This Mac is not ready for Offee yet:\n${failedChecks.map((check) => `• ${check}`).join('\n')}`
  if (output.includes('Homebrew is needed')) return 'Offee needs Homebrew to install Colima and Docker. Install it from https://brew.sh, then run setup again.'
  return `Something failed. The log below says what; it is also saved in ${logFile}.`
}
