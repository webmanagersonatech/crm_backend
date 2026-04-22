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
import mattrainingRoutes from './modules/mat-coaching-center/routes'

dotenv.config();

const app = express();

connectDB();

app.use(cors({
    origin: ['http://localhost:3000', 'http://160.187.54.80:3000', 'https://www.tpt.edu.in', 'https://www.sonabusinessschool.com', 'https://www.sonatech.ac.in', 'https://hika.sonastar.com', 'https://hikaapp.sonastar.com', 'https://hikaenq.sonastar.com', 'http://localhost:3001', 'http://160.187.54.80:3001', 'http://160.187.54.80:3002', 'http://localhost:3002'], // frontend URLs
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
app.use('/api/mat-training', mattrainingRoutes);
app.use('/api/ciicp', ciicpRoutes);
app.use('/api/captcha', captchaRoutes);
app.get('/', (req, res) => res.json({ ok: true, message: 'API Hika is running' }));

export default app;
