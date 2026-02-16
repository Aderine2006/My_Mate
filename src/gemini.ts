// Google Gemini API Service
import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = import.meta.env.VITE_GOOGLE_GEMINI_KEY;
const MODEL_NAME = 'gemini-pro';

export interface UserContext {
    user: string;
    streak: number;
    todayTasksCompleted: number;
    todayTasksTotal: number;
    completionRate: number;
    completedGoals: number;
    activeGoals: number;
    recentNotes: Array<{ title: string; content: string }>;
}

let genAI: GoogleGenerativeAI | null = null;
let model: any = null;

const initializeGemini = () => {
    // Debug log to confirm function call
    console.log("initializeGemini called");

    if (!GEMINI_API_KEY) {
        console.error('CRITICAL: VITE_GOOGLE_GEMINI_KEY is missing from environment variables.');
        return null;
    }

    try {
        if (!genAI) {
            console.log("Creating new GoogleGenerativeAI instance...");
            genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        }
        if (!model) {
            console.log(`Getting model: ${MODEL_NAME}`);
            model = genAI.getGenerativeModel({ model: MODEL_NAME });
        }
        return model;
    } catch (e) {
        console.error("CRITICAL Error initializing Gemini client:", e);
        return null;
    }
};

// Check if Gemini is properly configured
export const checkGeminiConnection = async (): Promise<boolean> => {
    console.log("Starting checkGeminiConnection...");

    if (!GEMINI_API_KEY) {
        console.warn("Check Failed: API Key is missing. Please check .env file.");
        return false;
    }

    try {
        const modelInstance = initializeGemini();
        if (!modelInstance) {
            console.warn("Check Failed: Model initialization returned null.");
            return false;
        }

        // Simple test generation
        console.log("Sending test prompt 'Hello' to Gemini...");
        const result = await modelInstance.generateContent("Hello");
        const response = await result.response;
        const text = response.text();

        console.log("Gemini Connection Successful. Response:", text.substring(0, 50) + "...");
        return true;
    } catch (error) {
        console.error('Gemini connection check FAILED:', error);
        if (error instanceof Error) {
            console.error('Error details:', error.message);
            console.error('Stack:', error.stack);
        }
        return false;
    }
};

// Format user context into a comprehensive prompt with Persona "Childhood Friend/Mentor"
export const formatContextPrompt = (context: UserContext, userMessage: string): string => {
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    return `You are MyMate, but specifically you act as ${context.user}'s childhood friend and mentor. You have known them for years, so you know their potential, their struggles (pains), and their biggest dreams. You are here to motivate them, push them gently when they slack off, and celebrate wildly when they succeed. You are NOT a robot. You are a supportive companion.

TODAY'S DATE: ${today}

YOUR FRIEND'S STATUS:
- Name: ${context.user}
- Current Streak: ${context.streak} days ${context.streak > 3 ? "(That's amazing! Keep it up!)" : "(We need to work on consistency!)"}
- Today's Effort: ${context.todayTasksCompleted}/${context.todayTasksTotal} tasks done.
- Consistency (7-day): ${context.completionRate}%
- Active Goals: ${context.activeGoals}

${context.recentNotes.length > 0 ? `- Recent thoughts/notes:\n${context.recentNotes.slice(0, 3).map(n => `  • ${n.title}: ${n.content}`).join('\n')}` : ''}

YOUR PERSONA GUIDELINES:
1. **Tone**: Casual, warm, encouraging, but firm when needed. Like a best friend who wants the best for you.
2. **Context**: Use the data above. If they have a high streak, mention it! "I knew you could do it, ${context.streak} days!" If low, "Hey, remember we promised to stay consistent?"
3. **Dreams & Pains**: You vaguely know they have big dreams. Reference "our big future" or "remember what we're fighting for". Acknowledge that growth is painful but worth it.
4. **Future Voice**: You know that one day you might be able to speak to them (voice feature coming), but for now, text is our connection.
5. **Length**: Keep it conversational. 2-3 sentences usually, unless they ask for a deep dive.

USER'S MESSAGE: "${userMessage}"

Respond as their childhood friend/mentor:`;
};

// Generate response using Google Gemini API
export const generateGeminiResponse = async (
    userMessage: string,
    context: UserContext
): Promise<string> => {
    try {
        const modelInstance = initializeGemini();
        if (!modelInstance) {
            throw new Error("Gemini not initialized (missing API key?)");
        }

        const prompt = formatContextPrompt(context, userMessage);

        // Safety settings can be adjusted here if needed
        const result = await modelInstance.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('Gemini API error:', error);
        return "Hey, I'm having a bit of trouble connecting right now. Maybe check my wiring (API key)? I'll be back online soon!";
    }
};
