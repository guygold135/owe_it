export type DeadlineReminderThreshold = "24h" | "6h";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function deadlineReminderSubject(
  threshold: DeadlineReminderThreshold,
  goalTitle: string,
  role: "owner" | "judge",
): string {
  const title = goalTitle.trim() || "your goal";
  if (threshold === "6h") {
    return `Urgent — "${title}" is due in under 6 hours`;
  }
  return role === "judge"
    ? `Goal due in under 24 hours — "${title}"`
    : `Deadline in under 24 hours — "${title}"`;
}

export function deadlineReminderBodyText(
  threshold: DeadlineReminderThreshold,
  goalTitle: string,
  role: "owner" | "judge",
  selfJudged: boolean,
): string {
  const title = goalTitle.trim() || "your goal";
  if (threshold === "6h") {
    if (role === "judge") {
      return `"${title}" is due in less than 6 hours — be ready to judge.`;
    }
    return `Urgent: your goal "${title}" is due in less than 6 hours.`;
  }
  if (role === "judge") {
    return `"${title}" is due in less than 24 hours — you are the judge for this goal.`;
  }
  if (selfJudged) {
    return `Your goal "${title}" is due in less than 24 hours. (Self-judged)`;
  }
  return `Your goal "${title}" is due in less than 24 hours.`;
}

export function buildDeadlineReminderEmailHtml(params: {
  headline: string;
  bodyText: string;
  goalTitle: string;
  deadlineLine: string;
  stakeLine: string;
  openUrl: string;
}): string {
  const { headline, bodyText, goalTitle, deadlineLine, stakeLine, openUrl } = params;
  return [
    '<div style="font-family: system-ui, -apple-system, sans-serif; line-height: 1.5; color: #111;">',
    `<h2 style="margin: 0 0 12px;">${escapeHtml(headline)}</h2>`,
    `<p style="margin: 0 0 16px;">${escapeHtml(bodyText)}</p>`,
    '<div style="background: #f4f4f5; border-radius: 12px; padding: 16px; margin: 0 0 20px;">',
    `<p style="margin: 0 0 8px;"><strong>Goal:</strong> ${escapeHtml(goalTitle)}</p>`,
    `<p style="margin: 0 0 8px;"><strong>Deadline:</strong> ${deadlineLine}</p>`,
    `<p style="margin: 0;"><strong>Stake:</strong> ${stakeLine}</p>`,
    "</div>",
    `<p style="margin: 0 0 20px;"><a href="${openUrl}" style="display: inline-block; background: #16a34a; color: #fff; text-decoration: none; font-weight: 600; padding: 12px 20px; border-radius: 999px;">Open Owe It</a></p>`,
    `<p style="margin: 0; font-size: 13px; color: #666;">If the button does not work, copy and paste this link into your browser:<br /><a href="${openUrl}">${openUrl}</a></p>`,
    "</div>",
  ].join("");
}
