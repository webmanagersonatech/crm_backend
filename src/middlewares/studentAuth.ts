import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import Student from "../modules/students/model";

dotenv.config();

export interface StudentAuthRequest extends Request {
    student?: any;
}

export const studentProtect = async (req: StudentAuthRequest, res: Response, next: NextFunction) => {

    const token = req.cookies.token; // ✅ read token from cookie
    if (!token) {
        return res.status(401).json({ message: "Not authorized" });
    }

    try {
        const decoded: any = jwt.verify(token, process.env.JWT_SECRET || "secret");

        const student = await Student.findById(decoded.id);
        if (!student) return res.status(401).json({ message: "Student not found" });

        req.student = student;
        next();
    } catch (err) {
        return res.status(401).json({ message: "Token invalid" });
    }
};
