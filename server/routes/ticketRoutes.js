import express from "express";
import { 
  getAllTickets, 
  getTicketById, 
  createTicket, 
  updateTicket, 
  deleteTicket,
  addReply,
  rateTicket
} from "../controllers/ticketController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

// All ticket routes require authentication
router.use(protect);

router.get("/", getAllTickets);
router.get("/:id", getTicketById);
router.post("/", createTicket);

// Reply to ticket (agents, admins, or owner client)
router.post("/:id/messages", addReply);

// Rate ticket (owner client only)
router.post("/:id/rate", rateTicket);

// Only Agents and Admins can update or delete tickets
router.patch("/:id", authorize("agent", "admin"), updateTicket);
router.delete("/:id", authorize("agent", "admin"), deleteTicket);

export default router;
