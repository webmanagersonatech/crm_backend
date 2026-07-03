// In your tuition fee routes file
import express from "express";
import {
  createRazorpayPayment,
  verifyRazorpayPayment,
  razorpayWebhook,
  createInstamojoTuitionPayment,
  instamojoTuitionRedirect,
  instamojoTuitionWebhook,
  createCCAvenueTuitionPayment,
  ccavenueTuitionSuccess,
  ccavenueTuitionCancel,
} from "./controller";
import { studentProtect } from "../../middlewares/studentAuth";

const router = express.Router();

// Razorpay Routes
router.post("/create/razorpay", studentProtect, createRazorpayPayment);
router.post("/verify/razorpay", verifyRazorpayPayment);
router.post("/webhook/razorpay", razorpayWebhook);

// Instamojo Routes
router.post("/create/instamojo", studentProtect, createInstamojoTuitionPayment);
router.get("/instamojo/redirect", instamojoTuitionRedirect);
router.post("/instamojo/webhook", instamojoTuitionWebhook);

// CCAvenue Routes
router.post("/create/ccavenue", studentProtect, createCCAvenueTuitionPayment);
router.post("/ccavenue/success", ccavenueTuitionSuccess);
router.get("/ccavenue/cancel", ccavenueTuitionCancel);

export default router;