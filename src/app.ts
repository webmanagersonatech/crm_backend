import express from 'express';
import cors from 'cors';
import { connectDB } from './config/db';
import authRoutes from './modules/auth/auth.routes';
import leadRoutes from './modules/lead/routes';
import path from 'path';
import institutionRoutes from './modules/institutions/routes';
import loginHistoryRoutes from './modules/login-histroy/routes';
import formManagerRoutes from './modules/form-manage/routes';
import applicationRoutes from './modules/applications/routes';
import permissionRoutes from './modules/permissions/routes';
import settingsRoutes from './modules/settings/routes';
import dashboardRoutes from './modules/dashboard/routes';
import otpRoutes from './modules/otp/routes';
import session from 'express-session';
import studentRoutes from './modules/students/routes';
import emailtemplateRoutes from './modules/email-templates/routes';
import dynamicformRoutes from './modules/dynamic-form-manage/routes';
import eventsRoutes from './modules/events/routes'
import othersRoutes from './modules/others/routes'
import paymentRoutes from './modules/payment/routes'
import ciicpRoutes from './modules/ciicp/routes'
import captchaRoutes from './modules/captcha/routes'
import { logger } from './middlewares/logger';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import summerCampRoutes from './modules/summercamp/routes';
import sonaCampRoutes from './modules/sonachamp/routes';
import mattrainingRoutes from './modules/mat-coaching-center/routes'
import feeConfigurationRoutes from './modules/fee-configuartion/routes';
import tuitionFeeRoutes from './modules/tuition-payment/routes';
import feesconcession from './modules/fees-concession/routes'
import additionalFeeConfigurationRoutes from './modules/additional-fee-configuartion/routes';
import paidFeeRoutes from './modules/paidfee/routes';
import StudentFeeStructure from './modules/StudentFeeStructure/routes';
import advancetokenamount from './modules/advance-tokenamount/routes'

dotenv.config();

const app = express();

connectDB();

app.use(cors({
  origin: ['http://localhost:3000', 'http://160.187.54.80:3000', 'https://sonavalliappapublicschool.com',
    'https://www.sonavalliappapublicschool.com', 'https://scaleindia.in', 'https://www.tpt.edu.in', 'https://www.sonamedicalcollege.ac.in', 'https://www.sonabusinessschool.com', 'https://www.sonatech.ac.in', 'https://hika.sonastar.com', 'https://hikaapp.sonastar.com', 'https://hikaenq.sonastar.com', 'http://localhost:3001', 'http://160.187.54.80:3001', 'http://160.187.54.80:3002', 'http://localhost:3002'], // frontend URLs
  credentials: true,
}));
declare module 'express-session' {
  interface SessionData {
    captcha: string | null;
  }
}
app.use(
  session({
    secret: "captcha-secret-key",
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: process.env.NODE_ENV === 'production', // Use secure in production
      maxAge: 1000 * 60 * 10 // 10 minutes
    },
    name: 'captcha.sid' // Custom name to avoid conflicts
  })
);
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: "100mb" }));
app.use(express.json());
app.use(cookieParser());
app.use(logger);
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/institutions', institutionRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/form-manager', formManagerRoutes);
app.use('/api/application', applicationRoutes);
app.use('/api/login-histories', loginHistoryRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/others', othersRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/otp', otpRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/dynamic-form-manage', dynamicformRoutes);
app.use('/api/email-templates', emailtemplateRoutes);
app.use('/api/summercamp', summerCampRoutes);
app.use('/api/sona-champs', sonaCampRoutes);
app.use('/api/mat-training', mattrainingRoutes);
app.use('/api/fee-configuration', feeConfigurationRoutes);
app.use('/api/ciicp', ciicpRoutes);
app.use('/api/tuition-fee', tuitionFeeRoutes);
app.use('/api/additional-fee-configuration', additionalFeeConfigurationRoutes);
app.use('/api/fee-concession', feesconcession);
app.use('/api/studentfeestructure', StudentFeeStructure);
app.use('/api/captcha', captchaRoutes);
app.use('/api/paid-fees', paidFeeRoutes);
app.use('/api/advancetoken-amount', advancetokenamount);

app.get("/", (req, res) => {
  res.status(200).send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>HiKa API | System Status</title>

      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          font-family: Inter, Arial, sans-serif;
          color: #f8fafc;
          background:
            radial-gradient(circle at top left, #164e63 0, transparent 40%),
            radial-gradient(circle at bottom right, #312e81 0, transparent 40%),
            #020617;
        }

        .container {
          width: 100%;
          max-width: 620px;
          padding: 48px 32px;
          text-align: center;
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 24px;
          background: rgba(15, 23, 42, 0.82);
          box-shadow: 0 25px 80px rgba(0, 0, 0, 0.35);
          backdrop-filter: blur(16px);
        }

        .logo {
          width: 76px;
          height: 76px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 24px;
          border-radius: 22px;
          color: white;
          font-size: 34px;
          font-weight: 800;
          background: linear-gradient(135deg, #06b6d4, #6366f1);
          box-shadow: 0 10px 35px rgba(6, 182, 212, 0.25);
        }

        h1 {
          font-size: clamp(30px, 6vw, 42px);
          letter-spacing: -1.5px;
          margin-bottom: 12px;
        }

        h1 span {
          color: #22d3ee;
        }

        .subtitle {
          color: #94a3b8;
          font-size: 15px;
          line-height: 1.7;
          margin-bottom: 30px;
        }

        .status {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 11px 18px;
          border: 1px solid rgba(34, 197, 94, 0.25);
          color: #86efac;
          background: rgba(34, 197, 94, 0.09);
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 32px;
        }

        .dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: #22c55e;
          box-shadow: 0 0 12px #22c55e;
          animation: pulse 1.6s infinite;
        }

        .details {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
          text-align: left;
        }

        .item {
          padding: 18px;
          border-radius: 14px;
          border: 1px solid rgba(148, 163, 184, 0.13);
          background: rgba(30, 41, 59, 0.55);
        }

        .label {
          display: block;
          color: #94a3b8;
          font-size: 12px;
          margin-bottom: 9px;
        }

        .value {
          color: #e2e8f0;
          font-size: 15px;
          font-weight: 600;
          overflow-wrap: anywhere;
        }

        .footer {
          margin-top: 32px;
          color: #64748b;
          font-size: 12px;
        }

        @keyframes pulse {
          50% { opacity: 0.4; }
        }

        @media (max-width: 420px) {
          .container { padding: 36px 20px; }
          .details { grid-template-columns: 1fr; }
        }

        @media (prefers-reduced-motion: reduce) {
          .dot { animation: none; }
        }
      </style>
    </head>

    <body>
      <main class="container">
        <div class="logo">H</div>

        <h1>HiKa <span>API</span></h1>

        <p class="subtitle">
          Reliable. Secure. Connected.<br />
          HiKa CRM backend service status.
        </p>

        <div class="status">
          <span class="dot"></span>
          API Service is Running
        </div>

        <div class="details">
          <div class="item">
            <span class="label">SERVICE</span>
            <span class="value">HiKa CRM Backend</span>
          </div>

          <div class="item">
            <span class="label">STATUS</span>
            <span class="value">Operational</span>
          </div>

          <div class="item">
            <span class="label">ENVIRONMENT</span>
            <span class="value">Production API</span>
          </div>

          <div class="item">
            <span class="label">RESPONSE</span>
            <span class="value">HTTP 200 OK</span>
          </div>
        </div>

        <div class="footer">
          &copy; ${new Date().getFullYear()} HiKa CRM. All rights reserved.
        </div>
      </main>
    </body>
    </html>
  `);
});


export default app;
