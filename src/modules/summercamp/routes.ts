import { Router } from "express";
import {
  createSummerCamp,
  listSummerCamps,
  getSummerCamp,
  updateSummerCamp,
  updatePaymentStatus,
  exportSummerCamps,
  deleteSummerCamp,
} from "./controller";
import { protect } from "../../middlewares/auth";

const router = Router();


router.get("/", protect, listSummerCamps);

router.get("/export", protect, exportSummerCamps);

router.post("/", createSummerCamp);

router.get("/:id", protect, getSummerCamp);

router.patch("/:id/payment", protect, updatePaymentStatus);

router.put("/:id", protect, updateSummerCamp);

router.delete("/:id", protect, deleteSummerCamp);

export default router;