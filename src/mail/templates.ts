import type { Mail } from "./mailer.service.js";

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const firstName = (name: string) => name.trim().split(/\s+/)[0] || "there";

function layout(heading: string, paragraphs: string[], button: { label: string; href: string }, footnote: string) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#2b2b2b">${p}</p>`).join("");
  return `<!doctype html>
<html><body style="margin:0;background:#f6f3ea;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f3ea;padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;padding:32px">
<tr><td>
<p style="margin:0 0 24px;font-size:18px;font-weight:bold;color:#1f4d2e">Tej Organics</p>
<h1 style="margin:0 0 16px;font-size:24px;color:#1f4d2e">${heading}</h1>
${body}
<p style="margin:24px 0"><a href="${escape(button.href)}" style="display:inline-block;background:#e8a317;color:#14301c;font-weight:bold;text-decoration:none;padding:14px 24px;border-radius:999px">${button.label}</a></p>
<p style="margin:0;font-size:14px;line-height:1.5;color:#6b6b6b">${footnote}</p>
<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#6b6b6b;word-break:break-all">If the button doesn't work, copy this link into your browser:<br>${escape(button.href)}</p>
</td></tr></table>
</td></tr></table>
</body></html>`;
}

export function verifyEmailMail(to: string, name: string, link: string): Mail {
  const hi = `Hi ${firstName(name)},`;
  return {
    to,
    subject: "Confirm your email for Tej Organics",
    text: `${hi}\n\nConfirm your email so we can send your order updates:\n${link}\n\nThis link works for 24 hours. If you didn't create an account, ignore this email.`,
    html: layout(
      "Confirm your email",
      [escape(hi), "Confirm your email so we can send your order updates and invoices here."],
      { label: "Confirm email", href: link },
      "This link works for 24 hours. If you didn't create an account, you can ignore this email.",
    ),
  };
}

export function passwordResetMail(to: string, name: string, link: string, validFor: string): Mail {
  const hi = `Hi ${firstName(name)},`;
  return {
    to,
    subject: "Reset your Tej Organics password",
    text: `${hi}\n\nSomeone asked to reset the password for this account. To choose a new one, open:\n${link}\n\nThis link works for ${validFor} and only once. If it wasn't you, ignore this email; your password stays the same.`,
    html: layout(
      "Reset your password",
      [escape(hi), "Someone asked to reset the password for this account. Choose a new one with the button below."],
      { label: "Choose a new password", href: link },
      `This link works for ${validFor} and only once. If it wasn't you, ignore this email; your password stays the same.`,
    ),
  };
}
