import { Router } from "express";
import {
  createMatTraining,
  listMatTraining,
  getMatTraining,
  updateMatTraining,
  exportMatTraining,
  uploadPaymentScreenshot,
  verifyPayment,
  deleteMatTraining,
} from "./controller";
import { protect } from "../../middlewares/auth";

const router = Router();

/* =========================
   ROUTES
========================= */


router.get("/", protect, listMatTraining);


router.get("/export", protect, exportMatTraining);


router.post("/", createMatTraining);

router.post("/upload-payment", uploadPaymentScreenshot);

router.get("/:id", protect, getMatTraining);

router.patch("/verify-payment/:id", protect, verifyPayment);


router.put("/:id", protect, updateMatTraining);

router.delete("/:id", protect, deleteMatTraining);

export default router;