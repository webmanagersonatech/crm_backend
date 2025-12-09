import { Router } from 'express';
import {
  createInstitution,
  listInstitutions,
  getInstitution,
  updateInstitution,
  deleteInstitution,
  getActiveInstitutions,
  getActiveData
  
} from './controller';
import { protect } from '../../middlewares/auth';

const router = Router();
router.get('/active', protect, getActiveInstitutions);
router.get('/activedata', protect, getActiveData);
router.get('/', protect, listInstitutions);      
router.post('/', protect, createInstitution);      
router.get('/:id', protect, getInstitution);       
router.put('/:id', protect, updateInstitution);    
router.delete('/:id', protect, deleteInstitution); 

export default router;
