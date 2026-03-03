// payments/routes.ts
import express from "express";
import { studentProtect } from "../../middlewares/studentAuth";
import { protect } from "../../middlewares/auth";
import {
  createPayment,
  verifyPayment,
  listPayments,
  instamojoCallback,
  instamojoWebhook,
  getPaymentStatus,
} from "./controller";

const router = express.Router();

// 👨‍🎓 Student
router.post("/create", studentProtect, createPayment);
router.post("/verify", verifyPayment);
router.get("/status/:applicationId", studentProtect, getPaymentStatus);

// Instamojo routes
router.post("/instamojo-callback", instamojoCallback);
router.post("/instamojo-webhook", instamojoWebhook);

// 👨‍💼 Admin
router.get("/", protect, listPayments);

export default router;