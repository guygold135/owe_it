export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildJudgeAcceptedEmailHtml(params: {
  judgeName: string;
  goalTitle: string;
  continueUrl: string;
}): string {
  const { judgeName, goalTitle, continueUrl } = params;
  const safeJudge = escapeHtml(judgeName);
  const safeTitle = escapeHtml(goalTitle);
  return [
    '<div style="font-family: system-ui, -apple-system, sans-serif; line-height: 1.5; color: #111;">',
    `<h2 style="margin: 0 0 12px;">${safeJudge} accepted your judge request</h2>`,
    `<p style="margin: 0 0 16px;">`,
    `<strong>${safeJudge}</strong> accepted judging `,
    `<strong>&ldquo;${safeTitle}&rdquo;</strong>. `,
    `Continue where you left off to add payment and finish your goal.`,
    `</p>`,
    `<p style="margin: 0 0 20px;"><a href="${continueUrl}" style="display: inline-block; background: #16a34a; color: #fff; text-decoration: none; font-weight: 600; padding: 12px 20px; border-radius: 999px;">Continue goal setup</a></p>`,
    `<p style="margin: 0; font-size: 13px; color: #666;">If the button does not work, copy and paste this link into your browser:<br /><a href="${continueUrl}">${continueUrl}</a></p>`,
    "</div>",
  ].join("");
}
