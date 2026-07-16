import express from "express";
import { protect } from "../../middlewares/auth";
import {
  createFeeConcession,
  listFeeConcessions,
  getFeeConcession,
  updateFeeConcession,
  deleteFeeConcession,
  updateFeeConcessionStatus
 
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
router.patch("/:id/status", protect, updateFeeConcessionStatus);
// Update Fee Concession (Only if Pending)
router.put("/:id", protect, updateFeeConcession);

// Delete Fee Concession
router.delete("/:id", protect, deleteFeeConcession);





export default router;