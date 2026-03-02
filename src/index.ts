import express from 'express';
import subjectsRouter from './routes/subjects';
import cors from 'cors';
import securityMiddleware from './middleware/security';
import { auth } from './lib/auth';
import { toNodeHandler } from "better-auth/node";

const app = express();
const PORT = 8000;
const FRONTEND_URL = process.env.FRONTEND_URL;

if (!FRONTEND_URL) {
  throw new Error('Missing required env var: FRONTEND_URL');
}

// CORS configuration
app.use(cors({
  origin: FRONTEND_URL,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true
}));

app.all("/api/auth/*splat", toNodeHandler(auth));

// Middleware
app.use(express.json());
app.use(securityMiddleware);

// Root GET route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the API!' });
});

// Subjects routes
app.use('/api/subjects', subjectsRouter);

// Start server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
