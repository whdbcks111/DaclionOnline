import nodemailer from 'nodemailer'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import logger from '../utils/logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATES_DIR = resolve(__dirname, '../templates')

let transporter: nodemailer.Transporter

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_APP_PASSWORD,
      },
    })
  }
  return transporter
}

export function loadTemplate(name: string, vars: Record<string, string> = {}): string {
  let html = readFileSync(resolve(TEMPLATES_DIR, `${name}.html`), 'utf-8')
  for (const [key, value] of Object.entries(vars)) {
    html = html.replaceAll(`{{${key}}}`, value)
  }
  return html
}

interface MailOptions {
  to: string
  subject: string
  text?: string
  html?: string
}

export async function sendMail({ to, subject, text, html }: MailOptions) {
  try {
    const info = await getTransporter().sendMail({
      from: `"Daclion Online" <${process.env.MAIL_USER}>`,
      to,
      subject,
      text,
      html,
    })
    logger.success(`메일 발송 성공: ${to} (${info.messageId})`)
    return info
  } catch (error) {
    logger.error('메일 발송 실패:', error)
    throw error
  }
}
