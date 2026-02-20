import { Router } from 'express'
import {
    createApplication,
    listApplications,
    getApplication,
    updateApplication,
    deleteApplication,
    updatePaymentStatus,
    listpendingApplications,
    sendTemplateMails,
    createApplicationByStudent,
    getApplicationByStudent,
    getApplicationByStudents,
    sendSMS,
    updateAcademicYearInMatchedApplicationStudent,
    findUnmatchedStudentId,
    bulkUploadApplications,
    findUnmatchedStudentIds
} from './controller'
import { protect } from '../../middlewares/auth'
import { studentProtect } from "../../middlewares/studentAuth";
import { upload } from "./multerConfig";

import multer, { FileFilterCallback } from "multer";

const router = Router()
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/");
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + "-" + file.originalname);
    },
});

/* ✅ Proper TS fileFilter */
const fileFilter = (
    req: Express.Request,
    file: Express.Multer.File,
    cb: FileFilterCallback
) => {
    const allowedTypes = [
        "text/csv",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error("Only CSV and Excel files are allowed."));
    }
};

const bulkUpload = multer({
    storage,
    fileFilter,
});
router.post(
    "/bulk-upload",
    protect,
    bulkUpload.single("file"),
    bulkUploadApplications
);

router.post("/", protect, upload.any(), createApplication);
router.post("/updateacadamicyear", updateAcademicYearInMatchedApplicationStudent);
router.post("/sms", sendSMS);
router.post("/student", studentProtect, upload.any(), createApplicationByStudent);
router.get("/student/:applicationId", studentProtect, getApplicationByStudent);
router.get("/getapplicationstudent", studentProtect, getApplicationByStudents);
router.get('/', protect, listApplications)
router.get("/pending-applications", protect, listpendingApplications);
router.get('/:id', protect, getApplication)
router.put("/:id", protect, upload.any(), updateApplication);
router.patch("/:id/payment-status", protect, updatePaymentStatus);
router.delete('/:id', protect, deleteApplication)
router.post("/send-mail", protect, sendTemplateMails);

export default router
