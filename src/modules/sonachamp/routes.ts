import { Router } from "express";
import multer from "multer";
import {
  createSonaChamps,
  listSonaChamps,
  getSonaChamps,
  updateSonaChamps,
  updateAttendance,
  exportSonaChamps,
  deleteSonaChamps,
  bulkUploadSonaChamps,
  
} from "./controller";

import { protect } from "../../middlewares/auth";

const router = Router();

// Multer memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB cap
  fileFilter: (_req, file, cb) => {
    const ok = /\.(csv|xls|xlsx)$/i.test(file.originalname);
    if (!ok) return cb(new Error("Only CSV, XLS, or XLSX allowed"));
    cb(null, true);
  },
});

/* =========================
   SONA CHAMPS '26 – Registration
========================= */

// Public registration (single)
router.post("/", createSonaChamps);

// Bulk upload — MUST be before "/:id"
router.post(
  "/bulk-upload",
  protect,
  upload.single("file"),
  bulkUploadSonaChamps
);



// Admin / staff routes
router.get("/", protect, listSonaChamps);
router.get("/export", protect, exportSonaChamps);
router.get("/:id", protect, getSonaChamps);

// Attendance toggle
router.patch("/:id/attendance", protect, updateAttendance);

// Full update
router.put("/:id", protect, updateSonaChamps);

// Delete
router.delete("/:id", protect, deleteSonaChamps);

export default router;