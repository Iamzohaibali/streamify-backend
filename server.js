// dotenv MUST be the very first thing — before any other import
// because ES module imports are hoisted and run before any code in this file
import { config } from 'dotenv';
config();

// IMPORTANT: Import and configure Cloudinary IMMEDIATELY after dotenv
import { cloudinary } from './src/config/cloudinary.js';

// Now import the rest of your app
import app from './src/app.js';
import { connectDB } from './src/config/db.js';

const PORT = process.env.PORT || 5000;

// Force reconfigure Cloudinary with the loaded env vars
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 Client URL: ${process.env.CLIENT_URL}`);
    // Confirm Cloudinary is configured
    if (process.env.CLOUDINARY_API_KEY) {
      console.log(`☁️  Cloudinary configured (cloud: ${process.env.CLOUDINARY_CLOUD_NAME})`);
    } else {
      console.warn('⚠️  Cloudinary API key missing — check .env');
    }
  });
});