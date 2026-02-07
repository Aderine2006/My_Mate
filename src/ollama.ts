// Ollama API Service
// Supports both local Ollama and hosted Ollama services

const OLLAMA_API_KEY = '2bb30a01f5e74b369f42719a5fe52fc2.7faZw7eTVWK9nIKpFDor0cGJ';
const OLLAMA_BASE_URL = import.meta.env.VITE_OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = import.meta.env.VITE_OLLAMA_MODEL || 'llama3.1';

interface OllamaResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

interface OllamaError {
  error: string;
}

export interface UserContext {
  user: string;
  streak: number;
  todayTasksCompleted: number;
  todayTasksTotal: number;
  completionRate: number;
  completedGoals: number;
  activeGoals: number;
  totalSkills: number;
  totalHours: number;
  recentNotes: { title: string; content: string }[];
  topSkills: { name: string; level: string; hoursInvested: number }[];
}

// Check if Ollama is available
export const checkOllamaConnection = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      method: 'GET',
      headers: OLLAMA_API_KEY ? {
        'Authorization': `Bearer ${OLLAMA_API_KEY}`,
        'Content-Type': 'application/json'
      } : {
        'Content-Type': 'application/json'
      }
    });
    return response.ok;
  } catch (error) {
    console.error('Ollama connection check failed:', error);
    return false;
  }
};

// Format user context into a comprehensive prompt
export const formatContextPrompt = (context: UserContext, userMessage: string): string => {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return `You are MyMate, a personal productivity assistant for ${context.user}. Your role is to help them understand their progress, provide insights, and offer personalized guidance.

TODAY'S DATE: ${today}

STRUCTURED DATA (Skills, Goals, Habits):
- Daily Streak: ${context.streak} days (maintains consistency by using the app daily)
- Today's Tasks: ${context.todayTasksCompleted} completed out of ${context.todayTasksTotal} total
- Completion Rate: ${context.completionRate}% (7-day average)
- Active Goals: ${context.activeGoals}
- Completed Goals: ${context.completedGoals}
- Total Skills Tracked: ${context.totalSkills}
- Hours Invested in Learning: ${context.totalHours.toFixed(1)} hours
${context.topSkills.length > 0 ? `- Top Skills:\n${context.topSkills.map(s => `  • ${s.name} (${s.level}) - ${s.hoursInvested} hours`).join('\n')}` : ''}

UNSTRUCTURED DATA (Notes):
${context.recentNotes.length > 0 ? `- Recent Notes:\n${context.recentNotes.map(n => `  • ${n.title}: ${n.content}`).join('\n')}` : '- Notes: None yet'}

YOUR CAPABILITIES:
1. Answer questions about their progress, goals, skills, and habits
2. Provide insights and patterns from their data
3. Offer personalized recommendations based on their performance
4. Help them reflect on their journey and growth
5. Motivate and encourage them based on their achievements

INSTRUCTIONS:
- Be friendly, supportive, and conversational
- Use the data provided to give specific, personalized responses
- Provide actionable insights when possible
- Keep responses concise but helpful (2-4 sentences unless detailed analysis is requested)
- If data is missing, encourage them to track more information
- Use emojis sparingly for emphasis

USER'S QUESTION: "${userMessage}"

Provide a helpful, personalized response based on the context above:`;
};

// Generate response using Ollama API
export const generateOllamaResponse = async (
  userMessage: string,
  context: UserContext
): Promise<string> => {
  try {
    const prompt = formatContextPrompt(context, userMessage);

    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(OLLAMA_API_KEY ? { 'Authorization': `Bearer ${OLLAMA_API_KEY}` } : {})
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9,
          top_k: 40,
        }
      })
    });

    if (!response.ok) {
      const error: OllamaError = await response.json();
      throw new Error(error.error || `Ollama API error: ${response.status}`);
    }

    const data: OllamaResponse = await response.json();
    return data.response.trim();
  } catch (error) {
    console.error('Ollama API error:', error);
    throw error;
  }
};

// Stream response using Ollama API (for real-time updates)
export const streamOllamaResponse = async (
  userMessage: string,
  context: UserContext,
  onChunk: (chunk: string) => void
): Promise<void> => {
  try {
    const prompt = formatContextPrompt(context, userMessage);

    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(OLLAMA_API_KEY ? { 'Authorization': `Bearer ${OLLAMA_API_KEY}` } : {})
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: prompt,
        stream: true,
        options: {
          temperature: 0.7,
          top_p: 0.9,
          top_k: 40,
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error('No response body');
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.response) {
            onChunk(data.response);
          }
        } catch (e) {
          // Skip invalid JSON lines
        }
      }
    }
  } catch (error) {
    console.error('Ollama streaming error:', error);
    throw error;
  }
};
