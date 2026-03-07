import AgentAPI from "apminsight";
AgentAPI.config()

import express from 'express';
import cors from "cors";
import type { Request, Response, NextFunction } from "express";

import subjectsRouter from "./routes/subjects.js";
import usersRouter from "./routes/users.js";
import classesRouter from "./routes/classes.js";
import departmentsRouter from "./routes/departments.js";
import dashboardRouter from "./routes/dashboard.js";
import securityMiddleware from "./middleware/security.js";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.js";

const app = express();
const PORT = 8000;

if (!process.env.FRONTEND_URL) throw new Error('FRONTEND_URL is not set in .env file');

app.use(cors({
  origin: process.env.FRONTEND_URL,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  credentials: true
}));

// better-auth handles its own body parsing — must be before express.json()
app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json());

// Populate req.user from the better-auth session so securityMiddleware
// can apply role-based rate limits correctly
app.use(async (req: Request, _res: Response, next: NextFunction) => {
  try {
    // Convert Node IncomingHttpHeaders → Web API Headers
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value !== undefined) {
        headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      }
    }
    const session = await auth.api.getSession({ headers });
    if (session?.user) {
      req.user = {
        id: session.user.id,
        role: (session.user as any).role ?? "student",
      };
    }
  } catch {
    // unauthenticated request — req.user stays undefined (guest)
  }
  next();
});

// Security middleware (rate limit + bot detection) must run BEFORE routes
app.use(securityMiddleware);

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

app.use('/api/subjects', requireAuth, subjectsRouter);
app.use('/api/users', requireAuth, usersRouter);
app.use('/api/classes', requireAuth, classesRouter);
app.use('/api/departments', requireAuth, departmentsRouter);
app.use('/api/dashboard', requireAuth, dashboardRouter);

app.get('/', (_req, res) => {
  res.send('Hello, welcome to the Classroom API!');
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
