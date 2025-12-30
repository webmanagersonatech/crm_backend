import express from "express";
import { studentProtect } from "../../middlewares/studentAuth";
import {
    createStudent,
    getStudent,
    getAllStudents,
    updateStudent,
    studentLogin,
    changePasswordwithotpverfiedstudent,
    changePassword,
    getLoggedInStudent
} from "./controller";

const router = express.Router();
router.post("/", createStudent);
router.post("/changePassword", studentProtect, changePassword);
router.post("/login", studentLogin);
router.post("/changenewpassword", changePasswordwithotpverfiedstudent);
router.get("/", getAllStudents);
router.get("/:id", getStudent);
router.get("/student/me", studentProtect, getLoggedInStudent);
router.get("/studentindiual/:id", studentProtect, getStudent);
router.put("/:id", updateStudent);
router.put("/studentindiual/:id", studentProtect, updateStudent);

export default router;
