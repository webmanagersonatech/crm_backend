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
  createCCAvenuePayment,
  ccavenueCancel,
  ccavenueSuccess,
  razorpayWebhook,
  getAllPaidPayments,
  exportAllPaidPayments,
} from "./controller";

const router = express.Router();

// 👨‍🎓 Student
router.post("/razorpay/create", studentProtect, createRazorpayPayment);
router.post("/razorpay/verify", verifyRazorpayPayment);
router.post("/razorpay/webhook", razorpayWebhook);

router.post("/instamojo/create", studentProtect, createInstamojoPayment);
router.get("/instamojo/redirect", verifyInstamojoRedirect); // browser redirect
router.post("/instamojo/webhook", instamojoWebhook); // server to server
router.post(
  "/ccavenue/create",
  studentProtect,
  createCCAvenuePayment
);

router.post(
  "/ccavenue/success",
  ccavenueSuccess
);

router.post(
  "/ccavenue/cancel",
  ccavenueCancel
);
// 👨‍💼 Admin
router.get("/", protect, listPayments);
router.get("/paid/export", protect, exportAllPaidPayments);
router.get("/paid", protect, getAllPaidPayments);



export default router;