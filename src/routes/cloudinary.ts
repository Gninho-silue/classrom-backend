import express from 'express';
import { v2 as cloudinary } from 'cloudinary';

const router = express.Router();

// Cloudinary config — fail fast if credentials are missing
const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
const api_key = process.env.CLOUDINARY_API_KEY;
const api_secret = process.env.CLOUDINARY_API_SECRET;

if (!cloud_name || !api_key || !api_secret) {
    throw new Error(
        'Missing required Cloudinary env vars: ensure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET are set in .env'
    );
}

cloudinary.config({ cloud_name, api_key, api_secret });

// DELETE /api/cloudinary/delete (or POST since fetch uses POST)
router.post('/delete', async (req, res) => {
    const { publicId } = req.body;

    if (!publicId) {
        return res.status(400).json({ error: 'publicId is required' });
    }

    try {
        const result = await cloudinary.uploader.destroy(publicId);
        return res.status(200).json({ success: true, result });
    } catch (error) {
        console.error('Cloudinary delete error:', error);
        return res.status(500).json({ error: 'Failed to delete image' });
    }
});

export default router;
