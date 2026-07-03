import express from "express";
import { protect } from "../../middlewares/auth";
import {
  createFeeConcession,
  listFeeConcessions,
  getFeeConcession,
  updateFeeConcession,
  deleteFeeConcession,
  approveFeeConcession,
  rejectFeeConcession,
  cancelFeeConcession,
} from "./controller";

const router = express.Router();

/**
 * Fee Concessions
 */

// Create Fee Concession
router.post("/", protect, createFeeConcession);

// Get All Fee Concessions
router.get("/", protect, listFeeConcessions);

// Get Single Fee Concession
router.get("/:id", protect, getFeeConcession);

// Update Fee Concession (Only if Pending)
router.put("/:id", protect, updateFeeConcession);

// Delete Fee Concession
router.delete("/:id", protect, deleteFeeConcession);

/**
 * Status Actions
 */

// Approve
router.patch("/:id/approve", protect, approveFeeConcession);

// Reject
router.patch("/:id/reject", protect, rejectFeeConcession);

// Cancel
router.patch("/:id/cancel", protect, cancelFeeConcession);

export default router;