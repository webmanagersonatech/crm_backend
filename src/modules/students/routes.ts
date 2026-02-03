import express from "express";
import { studentProtect } from "../../middlewares/studentAuth";
import { protect } from "../../middlewares/auth";
import {
    createStudent,
    getStudent,
    listStudents,
    updateStudent,
    studentLogin,
    changePasswordwithotpverfiedstudent,
    changePassword,
    getLoggedInStudent,
    deleteStudent,
    updateStudentCleanupData
} from "./controller";

const router = express.Router();
router.post("/", createStudent);
router.post("/changePassword", studentProtect, changePassword);
router.post("/login", studentLogin);
router.post("/changenewpassword", changePasswordwithotpverfiedstudent);
router.get("/",protect, listStudents);
router.get("/:id", getStudent);
router.get("/student/me", studentProtect, getLoggedInStudent);
router.get("/studentindiual/:id", studentProtect, getStudent);
router.put("/:id",protect, updateStudentCleanupData);
router.put("/studentindiual/:id", studentProtect, updateStudent);
router.delete("/:id", protect, deleteStudent);


export default router;
