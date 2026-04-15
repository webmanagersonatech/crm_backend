import { Router } from "express";
import {
  createCIICP,
  listCIICP,
  getCIICP,
  updateCIICP,
  exportCIICP,
  deleteCIICP,
} from "./controller";
import { protect } from "../../middlewares/auth";

const router = Router();

/* =========================
   ROUTES
========================= */

router.get("/", protect, listCIICP);


router.get("/export", protect, exportCIICP);


router.post("/", createCIICP);


router.get("/:id", protect, getCIICP);


router.put("/:id", protect, updateCIICP);


router.delete("/:id", protect, deleteCIICP);

export default router;