import { Request } from "express";
import User from "../modules/auth/auth.model";

export interface AuthRequest extends Request {
    user?: any;
}

export const thirdPartyAuth = async (
    req: AuthRequest,
    res: any,
    next: any
) => {
    try {
        const apiKey = req.header("x-api-key");

        if (!apiKey) {
            return res.status(401).json({ message: "API Key required" });
        }

        const user = await User.findOne({
            apiKey,
            userType: "third_party",
            status: "active",
        });

        if (!user) {
            return res.status(401).json({ message: "Invalid API Key" });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(500).json({ message: "Server error" });
    }
};