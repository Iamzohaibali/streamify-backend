import pkg from 'cloudinary';
import multer from 'multer';

const cloudinary = pkg.v2;

// Don't check here - let server.js handle the config
// Just export the unconfigured instance

// ── Multer: store files in memory as Buffer ───────────────────────────────────
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (jpg, jpeg, png, gif, webp, svg)'), false);
    }
  },
});

// ── Upload buffer to Cloudinary ───────────────────────────────────────────────
export const uploadToCloudinary = (buffer, folder, mimetype) => {
  return new Promise((resolve, reject) => {
    const ext = mimetype === 'image/svg+xml' ? 'svg' : mimetype.split('/')[1] ?? 'jpg';
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image', format: ext },
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error.message);
          return reject(error);
        }
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    stream.end(buffer);
  });
};

export { cloudinary };