import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    const user = this.config.get<string>('SMTP_USER');

    if (host && user) {
      this.transporter = nodemailer.createTransport({
        host,
        port: this.config.get<number>('SMTP_PORT', 587),
        secure: this.config.get<number>('SMTP_PORT', 587) === 465,
        auth: {
          user,
          pass: this.config.get<string>('SMTP_PASS'),
        },
      });
      this.logger.log(`Mail transport configured (${host})`);
    } else {
      this.logger.warn('SMTP not configured — emails will not be sent');
    }
  }

  private get from(): string {
    return this.config.get<string>('SMTP_FROM', 'BudLog <noreply@example.com>');
  }

  /** Escape user-controlled values before inserting them into an HTML email body. */
  private escapeHtml(s: string): string {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Strip CR/LF from values used in a subject/header (header-injection guard). */
  private sanitizeHeader(s: string): string {
    return String(s).replace(/[\r\n]+/g, ' ').trim();
  }

  async sendMail(to: string, subject: string, html: string): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn(`Mail skipped (no SMTP): to=${to}, subject=${subject}`);
      return false;
    }

    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html });
      this.logger.log(`Mail sent: to=${to}, subject=${subject}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send mail to ${to}: ${error}`);
      return false;
    }
  }

  async sendInvitationEmail(params: {
    to: string;
    inviterName: string;
    accountName: string;
    inviteCode: string;
    role: string;
    expiresAt: Date;
  }): Promise<boolean> {
    const { to, inviterName, accountName, inviteCode, role, expiresAt } = params;

    const expiresFormatted = expiresAt.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const roleLabel = role === 'editor' ? 'Editor' : 'Viewer';
    // User-controlled — escape before embedding in the HTML body.
    const safeInviter = this.escapeHtml(inviterName);
    const safeAccount = this.escapeHtml(accountName);

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F8FAFB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFB;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:#4ECDC4;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:600;">
                You're invited!
              </h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 16px;color:#333;font-size:16px;line-height:1.5;">
                <strong>${safeInviter}</strong> invited you to join the account
                <strong>&ldquo;${safeAccount}&rdquo;</strong> as <strong>${roleLabel}</strong>.
              </p>

              <p style="margin:0 0 8px;color:#999;font-size:13px;text-align:center;">
                Your invite code:
              </p>
              <div style="background:#f5f5f5;border-radius:8px;padding:16px;text-align:center;margin:0 0 24px;">
                <span style="font-size:32px;font-weight:700;color:#333;letter-spacing:4px;">
                  ${inviteCode}
                </span>
              </div>

              <p style="margin:0 0 24px;color:#666;font-size:14px;line-height:1.5;">
                Open the app &rarr; Accounts &rarr; Join account, and enter this code.
              </p>

              <p style="margin:0;color:#999;font-size:12px;">
                This invitation expires on <strong>${expiresFormatted}</strong>.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #eee;text-align:center;">
              <p style="margin:0;color:#ccc;font-size:12px;">
                BudLog
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    return this.sendMail(
      to,
      `${this.sanitizeHeader(inviterName)} invited you to "${this.sanitizeHeader(accountName)}" — BudLog`,
      html,
    );
  }

  async sendVerificationEmail(to: string, code: string): Promise<boolean> {
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F8FAFB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFB;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <!-- Header -->
          <tr>
            <td style="background:#E37F2B;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">
                Verify Your Email
              </h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 24px;color:#1A1D26;font-size:16px;line-height:1.6;text-align:center;">
                Thank you for joining <strong>BudLog</strong>! <br/>
                Please use the code below to verify your email address.
              </p>

              <div style="background:#FDF0E4;border: 2px dashed #E37F2B;border-radius:12px;padding:24px;text-align:center;margin:0 0 32px;">
                <span style="font-size:42px;font-weight:800;color:#E37F2B;letter-spacing:10px;font-family: 'Courier New', Courier, monospace;">
                  ${code}
                </span>
              </div>

              <p style="margin:0 0 8px;color:#5E6272;font-size:14px;line-height:1.5;text-align:center;">
                This code will expire in <strong>24 hours</strong>.
              </p>
              <p style="margin:0;color:#9CA3B4;font-size:13px;line-height:1.5;text-align:center;">
                If you didn't create an account, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;background:#F8FAFB;border-top:1px solid #EEF0F4;text-align:center;">
              <p style="margin:0;color:#9CA3B4;font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:1px;">
                BudLog
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    return this.sendMail(
      to,
      `Verify your email — BudLog`,
      html,
    );
  }

  async sendWeeklyReport(params: {
    to: string;
    userName: string;
    accountName: string;
    periodLabel: string;
    totalIncome: number;
    totalExpenses: number;
    savingsRate: number;
    topCategories: Array<{ name: string; amount: number; percentage: number }>;
    currencyCode: string;
  }): Promise<boolean> {
    const { to, userName, accountName, periodLabel, totalIncome, totalExpenses, savingsRate, topCategories, currencyCode } = params;
    const netSavings = totalIncome - totalExpenses;
    const fmt = (n: number) => n.toFixed(2);

    const categoryRows = topCategories.slice(0, 5).map(c => `
      <tr>
        <td style="padding:8px 12px;color:#333;font-size:14px;border-bottom:1px solid #f0f0f0;">${c.name}</td>
        <td style="padding:8px 12px;color:#333;font-size:14px;text-align:right;border-bottom:1px solid #f0f0f0;">${currencyCode} ${fmt(c.amount)}</td>
        <td style="padding:8px 12px;color:#999;font-size:13px;text-align:right;border-bottom:1px solid #f0f0f0;">${c.percentage.toFixed(1)}%</td>
      </tr>
    `).join('');

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F8FAFB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFB;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background:#4ECDC4;padding:28px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">Weekly Financial Summary</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">${periodLabel}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 24px;color:#666;font-size:15px;">Hi ${userName}, here's your weekly summary for <strong>${accountName}</strong>.</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="padding:16px;background:#f0faf9;border-radius:8px;text-align:center;width:33%;">
                    <div style="color:#999;font-size:11px;text-transform:uppercase;margin-bottom:4px;">Income</div>
                    <div style="color:#2ecc71;font-size:18px;font-weight:700;">${currencyCode} ${fmt(totalIncome)}</div>
                  </td>
                  <td style="width:8px;"></td>
                  <td style="padding:16px;background:#fef5f5;border-radius:8px;text-align:center;width:33%;">
                    <div style="color:#999;font-size:11px;text-transform:uppercase;margin-bottom:4px;">Expenses</div>
                    <div style="color:#e74c3c;font-size:18px;font-weight:700;">${currencyCode} ${fmt(totalExpenses)}</div>
                  </td>
                  <td style="width:8px;"></td>
                  <td style="padding:16px;background:#f5f5ff;border-radius:8px;text-align:center;width:33%;">
                    <div style="color:#999;font-size:11px;text-transform:uppercase;margin-bottom:4px;">Savings</div>
                    <div style="color:${netSavings >= 0 ? '#2ecc71' : '#e74c3c'};font-size:18px;font-weight:700;">${currencyCode} ${fmt(netSavings)}</div>
                  </td>
                </tr>
              </table>
              ${topCategories.length > 0 ? `
              <p style="margin:0 0 12px;color:#333;font-size:15px;font-weight:600;">Top Categories</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr style="background:#f9f9f9;">
                  <th style="padding:8px 12px;text-align:left;color:#999;font-size:12px;text-transform:uppercase;">Category</th>
                  <th style="padding:8px 12px;text-align:right;color:#999;font-size:12px;text-transform:uppercase;">Amount</th>
                  <th style="padding:8px 12px;text-align:right;color:#999;font-size:12px;text-transform:uppercase;">Share</th>
                </tr>
                ${categoryRows}
              </table>` : ''}
              <p style="margin:0;color:#999;font-size:12px;text-align:center;">Savings rate: <strong>${savingsRate.toFixed(1)}%</strong></p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #eee;text-align:center;">
              <p style="margin:0;color:#ccc;font-size:12px;">BudLog</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    return this.sendMail(to, `Weekly Summary: ${periodLabel} — BudLog`, html);
  }

  async sendMonthlyDigest(params: {
    to: string;
    userName: string;
    accountName: string;
    periodLabel: string;
    totalIncome: number;
    totalExpenses: number;
    savingsRate: number;
    topCategories: Array<{ name: string; amount: number; percentage: number }>;
    incomeChange: number;
    expenseChange: number;
    currencyCode: string;
  }): Promise<boolean> {
    const { to, userName, accountName, periodLabel, totalIncome, totalExpenses, savingsRate, topCategories, incomeChange, expenseChange, currencyCode } = params;
    const fmt = (n: number) => n.toFixed(2);
    const changeIcon = (v: number) => v > 0 ? '&#9650;' : v < 0 ? '&#9660;' : '&#9644;';
    const changeColor = (v: number, invert = false) => {
      const positive = invert ? v < 0 : v > 0;
      return positive ? '#2ecc71' : v === 0 ? '#999' : '#e74c3c';
    };

    const categoryBars = topCategories.slice(0, 5).map(c => `
      <tr>
        <td style="padding:6px 0;color:#333;font-size:13px;width:120px;">${c.name}</td>
        <td style="padding:6px 8px;">
          <div style="background:#e8f8f5;border-radius:4px;height:18px;width:100%;">
            <div style="background:#4ECDC4;border-radius:4px;height:18px;width:${Math.min(c.percentage, 100)}%;"></div>
          </div>
        </td>
        <td style="padding:6px 0;color:#333;font-size:13px;text-align:right;width:100px;">${currencyCode} ${fmt(c.amount)}</td>
      </tr>
    `).join('');

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F8FAFB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFB;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background:linear-gradient(135deg,#4ECDC4,#44b8b0);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:600;">Monthly Digest</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:15px;">${periodLabel} &middot; ${accountName}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 24px;color:#666;font-size:15px;">Hi ${userName}, here's your monthly overview.</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
                <tr>
                  <td style="padding:20px;background:#f0faf9;border-radius:8px;text-align:center;" width="50%">
                    <div style="color:#999;font-size:11px;text-transform:uppercase;margin-bottom:6px;">Income</div>
                    <div style="color:#2ecc71;font-size:22px;font-weight:700;">${currencyCode} ${fmt(totalIncome)}</div>
                    <div style="color:${changeColor(incomeChange)};font-size:12px;margin-top:4px;">${changeIcon(incomeChange)} ${Math.abs(incomeChange).toFixed(1)}% vs last month</div>
                  </td>
                  <td style="width:12px;"></td>
                  <td style="padding:20px;background:#fef5f5;border-radius:8px;text-align:center;" width="50%">
                    <div style="color:#999;font-size:11px;text-transform:uppercase;margin-bottom:6px;">Expenses</div>
                    <div style="color:#e74c3c;font-size:22px;font-weight:700;">${currencyCode} ${fmt(totalExpenses)}</div>
                    <div style="color:${changeColor(expenseChange, true)};font-size:12px;margin-top:4px;">${changeIcon(expenseChange)} ${Math.abs(expenseChange).toFixed(1)}% vs last month</div>
                  </td>
                </tr>
              </table>
              <div style="text-align:center;padding:16px 0;">
                <span style="color:#999;font-size:12px;">Savings rate: </span>
                <span style="color:${savingsRate >= 0 ? '#2ecc71' : '#e74c3c'};font-size:16px;font-weight:700;">${savingsRate.toFixed(1)}%</span>
              </div>
              ${topCategories.length > 0 ? `
              <p style="margin:0 0 12px;color:#333;font-size:15px;font-weight:600;">Spending by Category</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                ${categoryBars}
              </table>` : ''}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #eee;text-align:center;">
              <p style="margin:0;color:#ccc;font-size:12px;">BudLog</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    return this.sendMail(to, `Monthly Digest: ${periodLabel} — BudLog`, html);
  }
}
