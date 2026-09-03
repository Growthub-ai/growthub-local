export function buildWorkspaceHelperApplyResponse({
  responseMode,
  threadId,
  applied,
  skipped,
  workspaceConfig,
  messages,
}) {
  const receipt = {
    ok: true,
    threadId,
    applied,
    skipped,
  };

  if (responseMode === "receipt") return receipt;

  return {
    ...receipt,
    workspaceConfig,
    messages,
  };
}
