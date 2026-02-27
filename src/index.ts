import express from 'express';
import subjectsRouter from './routes/subjects';
import cors from 'cors';

const app = express();
const PORT = 8000;
const FRONTEND_URL = process.env.FRONTEND_URL;

if (!FRONTEND_URL) {
  throw new Error('Missing required env var: FRONTEND_URL');
}

// CORS configuration
app.use(cors({
  origin: FRONTEND_URL,
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

// Middleware
app.use(express.json());

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
