import { Router } from "express"
import {
  createDynamicForm,
  updateDynamicForm,
  listDynamicForms,
  getDynamicForm,
  deleteDynamicForm,

} from "./controller"
import { protect } from "../../middlewares/auth"

const router = Router()
router.post("/", protect, createDynamicForm)
router.get("/", protect, listDynamicForms)
router.get("/:id", protect, getDynamicForm)
router.put("/:id", protect, updateDynamicForm)
router.delete("/:id", protect, deleteDynamicForm)

export default router
