import type { NextFunction, Request, Response } from "express";
import { aj } from "../config/arject";
import { slidingWindow } from "@arcjet/node";
import type { ArcjetNodeRequest } from "@arcjet/node";


const securityMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    if(process.env.NODE_ENV === "test") return next();
    
    try {
        const role: RateLimitRole = req.user?.role || "guest";

        let limit: number;
        let message: string;
    
        switch (role) {
            case "admin":
                limit = 20
                message = "Admin requests limit exceeded (20 per minute). Slow down!";
                break;
            case "teacher":
            case "student":
                limit = 10
                message = "Teacher/Student requests limit exceeded (10 per minute). Please wait!";
                break;
            default:
                limit = 5;
                message = "Guest requests limit exceeded (5 per minute). Please sign up or log in to continue!";
                break;
        }
        
        const client = aj.withRule(
           slidingWindow({
            mode: 'LIVE',
            interval: '1m',
            max: limit,
            
           })
        )

        const arjectRequest: ArcjetNodeRequest = {
            headers: req.headers,
            method: req.method,
            url: req.url,
            socket: req.socket,
        }

        const decision = await client.protect(arjectRequest);

        if(decision.isDenied() && decision.reason.isBot()) {
            return res.status(403).json({ error: "Forbidden", message: "Automated requests are not allowed"});
        }

        if(decision.isDenied() && decision.reason.isShield()) {
            return res.status(403).json({ error: "Forbidden", message: "Request blocked by security policy"});
        }

        if(decision.isDenied() && decision.reason.isRateLimit()) {
            return res.status(429).json({ error: "Too many requests", message: message});
        }

        next();

    } catch (error) {
        console.error("Security middleware error:", error);
        return res.status(500).json({ error: "Internal server error", message: "Something went wrong with security middleware"});
    }
}

export default securityMiddleware;