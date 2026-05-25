export type DeadlineReminderThreshold = "24h" | "6h";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeOwnerName(ownerDisplayName?: string): string {
  const name = ownerDisplayName?.trim();
  return name && name.length > 0 ? name : "Someone";
}

function normalizeGoalTitle(goalTitle: string): string {
  const title = goalTitle.trim();
  return title.length > 0 ? title : "a goal";
}

/** Amber triangle-alert icon (matches app StakeCard urgency indicator). */
export function deadlineAlertIconHtml(): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"',
    ' stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"',
    ' style="vertical-align:-2px;margin-right:8px;display:inline-block;" aria-hidden="true">',
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/>',
    '<path d="M12 9v4"/>',
    '<path d="M12 17h.01"/>',
    "</svg>",
  ].join("");
}

export function deadlineReminderSubject(
  threshold: DeadlineReminderThreshold,
  goalTitle: string,
  role: "owner" | "judge",
  ownerDisplayName?: string,
): string {
  const title = normalizeGoalTitle(goalTitle);
  if (role === "judge") {
    const owner = normalizeOwnerName(ownerDisplayName);
    if (threshold === "6h") {
      return `Urgent — ${owner}'s goal "${title}" is due in less than 6 hours`;
    }
    return `${owner}'s goal "${title}" is due in less than 24 hours`;
  }
  if (threshold === "6h") {
    return `Urgent — your goal "${title}" is due in less than 6 hours`;
  }
  return `Your goal "${title}" is due in less than 24 hours`;
}

export function deadlineReminderHeadline(
  threshold: DeadlineReminderThreshold,
  role: "owner" | "judge",
): string {
  if (threshold === "6h") {
    return role === "judge" ? "Urgent — judging soon" : "Urgent — less than 6 hours left";
  }
  return role === "judge" ? "Goal due in less than 24 hours" : "Deadline in less than 24 hours";
}

export function deadlineReminderBodyText(
  threshold: DeadlineReminderThreshold,
  goalTitle: string,
  role: "owner" | "judge",
  selfJudged: boolean,
  ownerDisplayName?: string,
): string {
  const title = normalizeGoalTitle(goalTitle);
  if (role === "judge") {
    const owner = normalizeOwnerName(ownerDisplayName);
    if (threshold === "6h") {
      return `${owner}'s goal "${title}" is due in less than 6 hours. Be ready to judge.`;
    }
    return `${owner}'s goal "${title}" is due in less than 24 hours.`;
  }
  if (threshold === "6h") {
    return `Your goal "${title}" is due in less than 6 hours.`;
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
  showAlertIcon?: boolean;
}): string {
  const { headline, bodyText, goalTitle, deadlineLine, stakeLine, openUrl, showAlertIcon = false } = params;
  const headlineHtml = showAlertIcon
    ? `${deadlineAlertIconHtml()}${escapeHtml(headline)}`
    : escapeHtml(headline);

  return [
    '<div style="font-family: system-ui, -apple-system, sans-serif; line-height: 1.5; color: #111;">',
    `<h2 style="margin: 0 0 12px; font-size: 20px; line-height: 1.3;">${headlineHtml}</h2>`,
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
