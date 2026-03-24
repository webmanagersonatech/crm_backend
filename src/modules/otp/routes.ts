import express from "express";
import { createOtp, verifyOtp, deleteOtpByEmail,verifyOtpstudent,createOtpstudent } from "./controller";

const router = express.Router();
router.post("/student", createOtpstudent);
router.post("/create", createOtp);
router.post("/verifystudent", verifyOtpstudent);
router.post("/verify", verifyOtp);
router.delete("/:email", deleteOtpByEmail);

export default router;
