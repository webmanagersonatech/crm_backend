import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import Student from "../modules/students/model";

dotenv.config();

export interface StudentAuthRequest extends Request {
    student?: any;
}

export const studentProtect = async (req: StudentAuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Not authorized" });
    }

    const token = authHeader.split(" ")[1];
    try {
        const decoded: any = jwt.verify(token, process.env.JWT_SECRET || "secret");

        // Attach student object
        const student = await Student.findById(decoded.id);
        if (!student) return res.status(401).json({ message: "Student not found" });

        req.student = student;
        next();
    } catch (err) {
        return res.status(401).json({ message: "Token invalid" });
    }
};
