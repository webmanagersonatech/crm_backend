import { Router } from "express";
import {
  createMatTraining,
  listMatTraining,
  getMatTraining,
  updateMatTraining,
  exportMatTraining,
  uploadPaymentScreenshot,
  deleteMatTraining,
} from "./controller";
import { protect } from "../../middlewares/auth";

const router = Router();

/* =========================
   ROUTES
========================= */

// 📄 List (with pagination + filters)
router.get("/", protect, listMatTraining);

// 📤 Export
router.get("/export", protect, exportMatTraining);

// 🆕 Create (public)
router.post("/", createMatTraining);
// 💳 Upload payment screenshot (public)
router.post("/upload-payment", uploadPaymentScreenshot);
// 🔍 Get single
router.get("/:id", protect, getMatTraining);

// ✏️ Update
router.put("/:id", protect, updateMatTraining);

// ❌ Delete
router.delete("/:id", protect, deleteMatTraining);

export default router;