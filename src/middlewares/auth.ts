import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import User from "../modules/auth/auth.model";

dotenv.config();

export interface AuthRequest extends Request {
  user?: any;
}

export const protect = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Not authorized" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded: any = jwt.verify(
      token,
      process.env.JWT_SECRET || "secret"
    );

    // 🔹 DB check only for tokenVersion
    const user = await User.findById(decoded.id).select("tokenVersion");

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    // 🔥 tokenVersion mismatch → expire token
    if (user.tokenVersion !== decoded.tokenVersion) {
      return res.status(401).json({
        message: "Session expired. Please login again.",
      });
    }

    // ✅ only decoded attach
    req.user = decoded;

    next();

  } catch (err) {
    return res.status(401).json({ message: "Token invalid" });
  }
};