import express from "express";
import { protect } from "../../middlewares/auth";
import {
  addPaidFee,
  getPaidFeesByStudent,
  updatePaidFee,
  deletePaidFee,
} from "./controller";

const router = express.Router();

router.post("/:studentId", protect, addPaidFee);
router.get("/:studentId", protect, getPaidFeesByStudent);
router.put("/:id", protect, updatePaidFee);
router.delete("/:id", protect, deletePaidFee);

export default router;