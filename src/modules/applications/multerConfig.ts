import multer from "multer";
import path from "path";
import fs from "fs";

// Ensure uploads directory
const uploadPath = path.join(__dirname, "../../../uploads");
if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });

// Storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadPath),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    // Remove spaces and non-alphanumeric characters from fieldname and original name
    const safeFieldName = file.fieldname.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-_]/g, "");
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${safeFieldName}-${uniqueSuffix}${ext}`);
  },
});

// Allowed types
const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp", ".pdf", ".doc", ".docx"];
const allowedMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const fileFilter = (req: any, file: Express.Multer.File, cb: any) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExtensions.includes(ext) || allowedMimeTypes.includes(file.mimetype)) cb(null, true);
  else cb(new Error("Invalid file type. Only images and documents are allowed."));
};

export const upload = multer({ storage, limits: { fileSize: 20  * 1024 * 1024 }, fileFilter });
