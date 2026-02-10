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
    findUnmatchedStudentId
} from './controller'
import { protect } from '../../middlewares/auth'
import { studentProtect } from "../../middlewares/studentAuth";
import { upload } from "./multerConfig";

const router = Router()

router.post("/", protect, upload.any(), createApplication);
router.post("/updateacadamicyear",  updateAcademicYearInMatchedApplicationStudent);
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
