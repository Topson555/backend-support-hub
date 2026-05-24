import { GoogleGenAI, Type } from "@google/genai";

let aiInstance = null;

export const getGeminiClient = () => {
  if (!aiInstance) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      console.warn(">>> GEMINI_API_KEY is not defined. AI Auto-Responder status: OFFLINE.");
      return null;
    }
    aiInstance = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }
  return aiInstance;
};

/**
 * Generates structured analytical insights about the ticket.
 * Runs in parallel or immediately on ticket creation.
 * @param {Object} ticket The ticket data
 * @returns {Promise<Object>} The structured insights
 */
export const generateAIInsights = async (ticket) => {
  const ai = getGeminiClient();
  if (!ai) {
    return {
      suggestedCategory: ticket.category || "General Support",
      suggestedResponse: "AI Diagnostics is currently offline. Please review this ticket manually.",
      urgencyLevel: 5,
      sentiment: "Neutral"
    };
  }

  try {
    const prompt = `Perform immediate diagnostic parsing on the following customer support ticket and extract structured analytics.
Ticket Subject: "${ticket.subject}"
Ticket Category: "${ticket.category || 'General Support'}"
Customer: "${ticket.customer || 'Customer'}"
Description: "${ticket.description || 'No description provided.'}"`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: "You are an AI Ticket Triaging Specialist. Analyze the input ticket and return structured insights according to the requested schema. Provide a highly accurate 'suggestedCategory' (1-3 words), a polite professional internal drafts/recommendations response for an agent to read as 'suggestedResponse', a numeric priority 'urgencyLevel' (scale 1 to 10), and a detected 'sentiment' like 'Happy', 'Frustrated', 'Neutral', 'Disappointed' or 'Confused'.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            suggestedCategory: {
              type: Type.STRING,
              description: "Optimal category classification label (e.g. 'Billing Query', 'Database Outage', 'UI Bug')"
            },
            suggestedResponse: {
              type: Type.STRING,
              description: "A draft reply designed for human support agents to refine or copy when addressing the issue."
            },
            urgencyLevel: {
              type: Type.INTEGER,
              description: "Urgency scale rating from 1 (lowest) to 10 (highest/critical)."
            },
            sentiment: {
              type: Type.STRING,
              description: "Customer's apparent mood or emotional tone detected in the description."
            }
          },
          required: ["suggestedCategory", "suggestedResponse", "urgencyLevel", "sentiment"]
        }
      }
    });

    if (response && response.text) {
      const parsed = JSON.parse(response.text.trim());
      return {
        suggestedCategory: parsed.suggestedCategory || ticket.category || "General Support",
        suggestedResponse: parsed.suggestedResponse || "Draft response generation failed.",
        urgencyLevel: typeof parsed.urgencyLevel === "number" ? parsed.urgencyLevel : 5,
        sentiment: parsed.sentiment || "Neutral"
      };
    }
    throw new Error("Empty text response from Gemini API for insights");
  } catch (error) {
    console.error(">>> Error generating Ticket AI Insights:", error.message);
    return {
      suggestedCategory: ticket.category || "General Support",
      suggestedResponse: "AI Diagnostics experienced a sync error with the LLM pipeline.",
      urgencyLevel: 5,
      sentiment: "Neutral"
    };
  }
};

/**
 * Generates an automated solution / auto-response message for newly created tickets.
 * @param {Object} ticket The ticket data (subject, description, category, customer)
 * @returns {Promise<string>} The generated reply.
 */
export const generateAutoResponse = async (ticket) => {
  const ai = getGeminiClient();
  if (!ai) {
    return `Hello ${ticket.customer || 'Customer'},

Thank you for reaching out to Support Hub! This is an automated confirmation that we have received your ticket regarding: **"${ticket.subject}"**.

An agent has been assigned to your request (${ticket.assignee || 'Unassigned'}) and is currently reviewing your details. As we're currently experiencing higher volume, a human agent may take a bit of time to jump online. Please feel free to add any additional logs or details here in the chat thread in the meantime!`;
  }

  try {
    const systemInstruction = `You are "Gemini AI Support Copilot", an elite, empathetic, and expert diagnostic engineer at Support Hub.
Our support services operate 24/7. Your absolute priority is to analyze newly submitted support tickets and provide a definitive, highly accurate, and comprehensive technical solution immediately so the customer can solve their issue without waiting for a human agent.

Follow these strict output guidelines:
1. GREETING: Warmly greet the customer by name. Acknowledge that because our services are 24/7, we have immediately initiated this smart AI agent response to resolve their issue.
2. TAILORED DIAGNOSIS: Provide a clear, sharp, analytical summary of what is likely causing their issue based on the specific ticket description and category.
3. CONCRETE STEP-BY-STEP SOLUTION: Provide highly robust, actionable, step-by-step instructions (with code blocks, configuration parameters, shell commands, or specific option paths where applicable) to guide them to an absolute solution. Avoid vague or generic advice—be concrete and precise.
4. IMPORTANT TIPS & WARNINGS: Offer 1-2 expert tips, best practices, or safety warnings related to their specific problem to prevent future issues.
5. REASSURANCE: Let them know that since Support Hub is 24/7, their tickets are tracked in real-time. If the steps do not fully resolve their issue, their assigned agent is monitored and will jump in to assist directly.

Maintain a professional, highly capable, and encouraging tone. Use clean, rich Markdown headings, bullet points, and highlight key options in bold. Do not output any system headers.`;

    const prompt = `Ticket subject: "${ticket.subject}"
Ticket Category: "${ticket.category || 'General Support'}"
Customer Name: "${ticket.customer || 'Customer'}"
Ticket Description:
"${ticket.description || 'No description provided.'}"`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7,
        tools: [{ googleSearch: {} }]
      }
    });

    if (response && response.text) {
      let text = response.text;
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (chunks && chunks.length > 0) {
        text += "\n\n---\n### 🌐 Useful Reference Resources\nHere are some vetted external articles and guides regarding this issue:\n";
        const seenUrls = new Set();
        chunks.forEach((chunk) => {
          if (chunk.web?.uri && chunk.web?.title) {
            const uri = chunk.web.uri;
            if (!seenUrls.has(uri)) {
              seenUrls.add(uri);
              text += `- [${chunk.web.title}](${uri})\n`;
            }
          }
        });
      }
      return text;
    }
    throw new Error("No text response from Gemini API");
  } catch (error) {
    console.error(">>> Error generating Gemini auto-response:", error.message);
    return `Hello ${ticket.customer || 'Customer'},

Thank you for reaching out to Support Hub! We have safely received your ticket: **"${ticket.subject}"**.

Your assigned agent is ${ticket.assignee || 'Unassigned'} and they will review your description and collaborate with you directly as soon as they are active. We appreciate your patience!`;
  }
};
