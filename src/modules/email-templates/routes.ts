import { Router } from "express";
import {
    createEmailTemplate,
    listEmailTemplates,
    getEmailTemplate,
    updateEmailTemplate,
    deleteEmailTemplate,
    listAllEmailTemplates
} from "./controller";
import { protect } from "../../middlewares/auth";

const router = Router();

/* ===============================
   Email Template Routes
================================ */

router.get("/", protect, listEmailTemplates);
router.get("/all", protect, listAllEmailTemplates);
router.post("/", protect, createEmailTemplate);
router.get("/:id", protect, getEmailTemplate);
router.put("/:id", protect, updateEmailTemplate);
router.delete("/:id", protect, deleteEmailTemplate);

export default router;
