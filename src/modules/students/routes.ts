import express from "express";
import { studentProtect } from "../../middlewares/studentAuth";
import {
    createStudent,
    getStudent,
    getAllStudents,
    updateStudent,
    studentLogin
} from "./controller";

const router = express.Router();
router.post("/", createStudent);
router.post("/login", studentLogin);
router.get("/", getAllStudents);
router.get("/:id", getStudent);
router.get("/studentindiual/:id", studentProtect, getStudent);
router.put("/:id", updateStudent);
router.put("/studentindiual/:id", studentProtect, updateStudent);

export default router;
