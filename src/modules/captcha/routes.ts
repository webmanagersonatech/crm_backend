// routes/captcha.routes.ts
import express from "express";

import { generateCaptcha, verifyCaptcha,
    refreshCaptcha  } from "./controller";

const router = express.Router();

// Public routes (no authentication needed)
router.get("/generate", generateCaptcha);
router.get("/refresh", refreshCaptcha); // alias for generate
router.post("/verify", verifyCaptcha);

export default router;