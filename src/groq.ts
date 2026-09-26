// Groq API Service for RAG Chatbot
// Uses Groq's fast inference API with RAG context from Firebase

import { getFunctions, httpsCallable } from 'firebase/functions';
import app, { auth } from './firebase';

const chatFunction = httpsCallable<{
  action?: 'status';
  message?: string;
  ragContext?: string;
  history?: GroqMessage[];
}, { available?: boolean; answer?: string; sources?: Array<{ title: string; url: string }> }>(
  getFunctions(app, 'us-central1'),
  'chatWithRag'
);

interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Vector embedding interface
export interface VectorDocument {
  id: string;
  text: string;
  embedding: number[];
  metadata: {
    type: 'goal' | 'task' | 'note' | 'skill' | 'reflection';
    userId: string;
    timestamp: string;
    [key: string]: any;
  };
}

// Check if Groq API is available
export const checkGroqConnection = async (expectedUserId?: string): Promise<boolean> => {
  try {
    await auth.authStateReady();
    if (!auth.currentUser || (expectedUserId && auth.currentUser.uid !== expectedUserId)) return false;
    const { data } = await chatFunction({ action: 'status' });
    return data.available === true;
  } catch {
    return false;
  }
};

// Deterministic token vectors support lexical retrieval; they are not semantic embeddings.
export const generateEmbedding = async (text: string): Promise<number[]> => {
  const embedding = new Array(256).fill(0);
  const words = text.toLowerCase().split(/\s+/);
  
  words.forEach((word) => {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = ((hash << 5) - hash) + word.charCodeAt(i);
      hash = hash & hash;
    }
    const position = Math.abs(hash) % 256;
    embedding[position] = (embedding[position] || 0) + 1;
  });
  
  // Normalize the embedding
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  return embedding.map(val => magnitude > 0 ? val / magnitude : 0);
};

// Calculate cosine similarity between two vectors
export const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
  if (vecA.length !== vecB.length) return 0;
  
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magnitudeA += vecA[i] * vecA[i];
    magnitudeB += vecB[i] * vecB[i];
  }
  
  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);
  
  if (magnitudeA === 0 || magnitudeB === 0) return 0;
  
  return dotProduct / (magnitudeA * magnitudeB);
};

// Format RAG context from retrieved documents
export const formatRAGContext = (documents: VectorDocument[], _userMessage: string): string => {
  if (documents.length === 0) {
    return 'No relevant context found from your data.';
  }

  let context = 'RELEVANT CONTEXT FROM YOUR DATA:\n\n';
  
  documents.forEach((doc, index) => {
    context += `[${index + 1}] ${doc.metadata.type.toUpperCase()}: ${doc.text}\n`;
    if (doc.metadata.title) {
      context += `   Title: ${doc.metadata.title}\n`;
    }
    if (doc.metadata.date) {
      context += `   Date: ${doc.metadata.date}\n`;
    }
    context += '\n';
  });
  
  return context;
};

// Generate response using Groq API with RAG
export const generateGroqResponse = async (
  userMessage: string,
  ragContext: string,
  conversationHistory: GroqMessage[] = []
): Promise<string> => {
  try {
    if (!auth.currentUser) throw new Error('Sign in with Google to use the AI assistant.');
    const { data } = await chatFunction({
      message: userMessage,
      ragContext,
      history: conversationHistory.slice(-10),
    });
    const answer = data.answer?.trim();
    if (!answer) throw new Error('The AI assistant returned an empty response.');
    const sources = data.sources ?? [];
    return sources.length > 0
      ? `${answer}\n\nSources:\n${sources.map((source, index) => `[${index + 1}] ${source.title} - ${source.url}`).join('\n')}`
      : answer;
  } catch (error) {
    console.error('Groq API error:', error);
    throw error;
  }
};

// Stream response using Groq API (for real-time updates)
export const streamGroqResponse = async (
  userMessage: string,
  ragContext: string,
  conversationHistory: GroqMessage[] = [],
  onChunk: (chunk: string) => void
): Promise<void> => {
  onChunk(await generateGroqResponse(userMessage, ragContext, conversationHistory));
};
