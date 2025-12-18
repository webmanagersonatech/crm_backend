import { Router } from 'express'
import {
    createOrUpdateFormManager,
    listFormManagers,
    deleteFormManager,
    getFormManagerByInstituteId,
    getstudentFormManagerByInstituteId
} from './controller'
import { protect } from '../../middlewares/auth'
import { studentProtect } from "../../middlewares/studentAuth";
const router = Router()
router.get('/', protect, listFormManagers)
router.post('/', protect, createOrUpdateFormManager)
router.get('/student', studentProtect, getstudentFormManagerByInstituteId)
router.get('/:instituteId', protect, getFormManagerByInstituteId)
router.delete('/:id', protect, deleteFormManager)

export default router
