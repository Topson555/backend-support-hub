import Ticket from "../models/Ticket.js";
import User from "../models/User.js";

export const getAllTickets = async (req, res) => {
  try {
    let query = {};
    
    // If not agent or admin, only show tickets belonging to this user
    if (req.user.role === 'user') {
      const user = await User.findById(req.user.id);
      query = { email: user.email };
    }

    const tickets = await Ticket.find(query).sort({ createdAt: -1 });
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getTicketById = async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    // Check ownership if user is not agent/admin
    if (req.user.role === 'user') {
      const user = await User.findById(req.user.id);
      if (ticket.email !== user.email) {
        return res.status(403).json({ error: "Not authorized to view this ticket" });
      }
    }

    res.json(ticket);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const createTicket = async (req, res) => {
  const io = req.app.get('io');
  try {
    const user = await User.findById(req.user.id);
    
    // If user is a customer, always use their info
    // If user is staff, they can provide customer info in req.body
    const ticketData = {
      ...req.body,
    };

    if (user.role === 'user') {
      ticketData.email = user.email;
      ticketData.customer = user.name;
    } else {
      // Staff must provide at least customer name if they are creating for someone else
      if (!ticketData.customer) ticketData.customer = user.name;
      if (!ticketData.email) ticketData.email = user.email;
    }

    // Category-based auto-assignment to agents
    let assignedStaff = "Unassigned";
    const staff = await User.find({ role: { $in: ['agent', 'admin'] } }).lean();
    if (staff.length > 0) {
      const categoryLower = (ticketData.category || "").toLowerCase();
      // Sort staff to make it deterministic
      staff.sort((a, b) => a.email.localeCompare(b.email));
      
      let staffIndex = 0;
      if (categoryLower.includes('technical') || categoryLower.includes('tech')) {
        staffIndex = 0 % staff.length;
      } else if (categoryLower.includes('billing') || categoryLower.includes('finance') || categoryLower.includes('pay')) {
        staffIndex = 1 % staff.length;
      } else if (categoryLower.includes('feature') || categoryLower.includes('request')) {
        staffIndex = 2 % staff.length;
      } else if (categoryLower.includes('account') || categoryLower.includes('access') || categoryLower.includes('login')) {
        staffIndex = 3 % staff.length;
      } else {
        staffIndex = 0;
      }
      assignedStaff = staff[staffIndex].name;
    }
    ticketData.assignee = assignedStaff;

    const newTicket = new Ticket(ticketData);
    await newTicket.save();
    console.log(">>> New Ticket Saved to DB with assignee:", assignedStaff);
    
    if (io) io.emit("ticket:created", newTicket);
    res.status(201).json(newTicket);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const updateTicket = async (req, res) => {
  const io = req.app.get('io');
  try {
    // Only allow updating certain fields for security
    const allowedUpdates = ['status', 'assignee', 'priority', 'category', 'subject', 'description'];
    const updates = {};
    
    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key)) {
        updates[key] = req.body[key];
      }
    });

    const updatedTicket = await Ticket.findByIdAndUpdate(
      req.params.id, 
      updates,
      { new: true }
    );
    
    if (!updatedTicket) return res.status(404).json({ error: "Ticket not found" });

    console.log(`>>> Ticket ${req.params.id} updated in DB`);
    if (io) io.emit("ticket:updated", updatedTicket);
    res.json(updatedTicket);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const deleteTicket = async (req, res) => {
  const io = req.app.get('io');
  try {
    const deletedTicket = await Ticket.findByIdAndDelete(req.params.id);
    if (!deletedTicket) return res.status(404).json({ error: "Ticket not found" });
    
    if (io) io.emit("ticket:deleted", req.params.id);
    res.json({ success: true, message: "Ticket deleted" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const addReply = async (req, res) => {
  const io = req.app.get('io');
  try {
    const { body, isInternal } = req.body;
    if (!body) return res.status(400).json({ error: "Message body is required" });

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    // Customer can only reply to their own tickets
    if (user.role === 'user' && ticket.email !== user.email) {
      return res.status(403).json({ error: "Not authorized to reply to this ticket" });
    }

    const newMessage = {
      senderName: user.name,
      senderEmail: user.email,
      senderRole: user.role,
      body,
      isInternal: user.role !== 'user' ? !!isInternal : false,
      createdAt: new Date()
    };

    ticket.messages.push(newMessage);
    
    // Auto-update status if staff replies and ticket was open
    if (user.role !== 'user' && ticket.status === 'open' && !isInternal) {
      ticket.status = 'pending';
    }

    await ticket.save();

    console.log(`>>> Message added to ticket ${ticket._id}`);
    
    if (io) {
      io.emit("ticket:updated", ticket);
      io.emit(`ticket:${ticket._id}:message`, newMessage);
    }

    res.status(201).json(ticket);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const rateTicket = async (req, res) => {
  const io = req.app.get('io');
  try {
    const { score, feedback } = req.body;
    if (!score || score < 1 || score > 5) {
      return res.status(400).json({ error: "Valid rating score (1-5) is required" });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    // Only owner of ticket can submit a rating
    if (ticket.email !== user.email) {
      return res.status(403).json({ error: "Only original customer can rate support quality" });
    }

    ticket.rating = {
      score,
      feedback: feedback || "",
      ratedAt: new Date()
    };

    await ticket.save();
    console.log(`>>> Ticket ${ticket._id} rated with score ${score}`);

    if (io) io.emit("ticket:updated", ticket);

    res.json(ticket);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
