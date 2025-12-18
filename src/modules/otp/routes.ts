import express from "express";
import { createOtp, verifyOtp, deleteOtpByEmail,createOtpstudent } from "./controller";

const router = express.Router();
router.post("/student", createOtpstudent);
router.post("/create", createOtp);

router.post("/verify", verifyOtp);
router.delete("/:email", deleteOtpByEmail);

export default router;
