import mongoose from 'mongoose';

const fileSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true, // Fast lookups by owner
    },
    originalName: {
      type: String,
      required: true,
      trim: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
      min: 0,
    },
    cloudinary: {
      url: { type: String, required: true },
      publicId: { type: String, required: true },
      format: { type: String },
    },
  },
  { timestamps: true }
);

export const File = mongoose.model('File', fileSchema);