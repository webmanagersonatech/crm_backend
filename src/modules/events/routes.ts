import { Router } from "express";
import {
  importEvents,
  createEvent,
  listEvents,
  getEvent,
  updateEvent,
  deleteEvent,
} from "./controller";
import { protect } from "../../middlewares/auth";
import multer from "multer";

const router = Router();

// Multer memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ✅ CRUD Routes
router.get("/", protect, listEvents);         // List with pagination & filters
router.post("/", protect, createEvent);       // Create single event
router.get("/:id", protect, getEvent);        // Get single event
router.put("/:id", protect, updateEvent);     // Update event
router.delete("/:id", protect, deleteEvent);  // Delete event

// ✅ CSV/XLSX import
router.post("/import", protect, upload.single("file"), importEvents);

export default router;
