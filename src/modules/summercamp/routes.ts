import { Router } from "express";
import {
  createSummerCamp,
  listSummerCamps,
  getSummerCamp,
  updateSummerCamp,
  deleteSummerCamp,
} from "./controller";
import { protect } from "../../middlewares/auth";

const router = Router();


router.get("/", protect, listSummerCamps);

router.post("/", createSummerCamp); 

router.get("/:id", protect, getSummerCamp);


router.put("/:id", protect, updateSummerCamp);

router.delete("/:id", protect, deleteSummerCamp);

export default router;