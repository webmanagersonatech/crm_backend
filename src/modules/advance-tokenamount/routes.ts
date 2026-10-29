import express from "express";
import { studentProtect } from "../../middlewares/studentAuth";
import { protect } from "../../middlewares/auth";
import {
  createAdvanceCCAvenuePayment,
  advanceCCAvenueSuccess,
  advanceCCAvenueCancel,
  createAdvanceRazorpayPayment,
  verifyAdvanceRazorpayPayment,
  advanceRazorpayWebhook,
  createAdvanceInstamojoPayment,
  verifyAdvanceInstamojoRedirect,
  advanceInstamojoWebhook,
  getAllPaidAdvanceTokenPayments,
  exportAllPaidAdvanceTokenPayments,
} from "./controller";

const router = express.Router();

/* ── CCAvenue ── */
router.post("/ccavenue/create", studentProtect, createAdvanceCCAvenuePayment);
router.post("/ccavenue/success", advanceCCAvenueSuccess);
router.post("/ccavenue/cancel", advanceCCAvenueCancel);
router.get("/ccavenue/cancel", advanceCCAvenueCancel);
router.get(
  "/paid",
  protect,
  getAllPaidAdvanceTokenPayments
);

router.get(
  "/paid/export",
  protect,
  exportAllPaidAdvanceTokenPayments
);
/* ── Razorpay ── */
router.post("/razorpay/create", studentProtect, createAdvanceRazorpayPayment);
router.post("/razorpay/verify", verifyAdvanceRazorpayPayment);
router.post("/razorpay/webhook", advanceRazorpayWebhook);

/* ── Instamojo ── */
router.post("/instamojo/create", studentProtect, createAdvanceInstamojoPayment);
router.get("/instamojo/redirect", verifyAdvanceInstamojoRedirect);
router.post("/instamojo/webhook", advanceInstamojoWebhook);

export default router;