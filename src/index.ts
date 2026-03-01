import express from 'express';
import subjectsRouter from './routes/subjects';
import cloudinaryRouter from './routes/cloudinary';
import cors from 'cors';
import securityMiddleware from './middleware/security';

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

// Middleware
app.use(express.json());
app.use(securityMiddleware);

// Root GET route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the API!' });
});

// Subjects routes
app.use('/api/subjects', subjectsRouter);

// Cloudinary routes
app.use('/api/cloudinary', cloudinaryRouter);

// Start server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
