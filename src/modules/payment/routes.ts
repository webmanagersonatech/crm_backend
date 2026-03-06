import express from "express";
import { studentProtect } from "../../middlewares/studentAuth";
import { protect } from "../../middlewares/auth";
import {
  createRazorpayPayment,
  verifyRazorpayPayment,
  createInstamojoPayment,
  verifyInstamojoRedirect,
  instamojoWebhook,
  listPayments,
  razorpayWebhook,
} from "./controller";

const router = express.Router();

// 👨‍🎓 Student
router.post("/razorpay/create", studentProtect, createRazorpayPayment);
router.post("/razorpay/verify", verifyRazorpayPayment);
router.post("/razorpay/webhook", razorpayWebhook);

router.post("/instamojo/create", studentProtect, createInstamojoPayment);
router.get("/instamojo/redirect", verifyInstamojoRedirect); // browser redirect
router.post("/instamojo/webhook", instamojoWebhook); // server to server

// 👨‍💼 Admin
router.get("/", protect, listPayments);

export default router;