import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  senderName: { type: String, required: true },
  senderEmail: { type: String, required: true },
  senderRole: { type: String, enum: ['user', 'agent', 'admin'], required: true },
  body: { type: String, required: true },
  isInternal: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

const ticketSchema = new mongoose.Schema({
  subject: { type: String, required: true },
  customer: String,
  email: { type: String, required: true, index: true },
  category: String,
  description: String,
  status: { type: String, default: 'open', index: true },
  priority: { type: String, default: 'medium', index: true },
  assignee: { type: String, default: 'Unassigned', index: true },
  createdAt: { type: Date, default: Date.now, index: true },
  messages: [messageSchema],
  aiInsights: {
    suggestedCategory: { type: String, default: "" },
    suggestedResponse: { type: String, default: "" },
    urgencyLevel: { type: Number, default: 5 },
    sentiment: { type: String, default: "Neutral" }
  },
  rating: {
    score: { type: Number, min: 1, max: 5 },
    feedback: String,
    ratedAt: { type: Date }
  }
});

const Ticket = mongoose.model('Ticket', ticketSchema);
export default Ticket;
