import express from "express";
import { studentProtect } from "../../middlewares/studentAuth";
import { protect } from "../../middlewares/auth";
import {
  createPayment,
  verifyPayment,
  listPayments,
} from "./controller";

const router = express.Router();

// 👨‍🎓 Student
router.post("/create", studentProtect, createPayment);
router.post("/verify", verifyPayment);

// 👨‍💼 Admin
router.get("/", protect, listPayments);

export default router;