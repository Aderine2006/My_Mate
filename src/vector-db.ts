// Vector Database Helpers for Firebase
// Stores and retrieves embeddings for RAG system

import { doc, setDoc, collection, getDocs, query, where, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';
import { generateEmbedding, cosineSimilarity, type VectorDocument } from './groq';

const EMBEDDINGS_COLLECTION = 'user_embeddings';

// Save a document with its embedding to Firebase
export const saveVectorDocument = async (
  userId: string,
  document: Omit<VectorDocument, 'embedding'>
): Promise<void> => {
  try {
    const embedding = await generateEmbedding(document.text);
    const docRef = doc(db, EMBEDDINGS_COLLECTION, `${userId}_${document.id}`);
    
    await setDoc(docRef, {
      ...document,
      embedding,
      userId,
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error saving vector document:', error);
    throw error;
  }
};

// Batch save multiple documents
export const batchSaveVectorDocuments = async (
  userId: string,
  documents: Omit<VectorDocument, 'embedding'>[]
): Promise<void> => {
  const promises = documents.map(doc => saveVectorDocument(userId, doc));
  await Promise.all(promises);
};

// Retrieve all embeddings for a user
export const getUserEmbeddings = async (userId: string): Promise<VectorDocument[]> => {
  try {
    const embeddingsRef = collection(db, EMBEDDINGS_COLLECTION);
    const q = query(embeddingsRef, where('userId', '==', userId));
    const querySnapshot = await getDocs(q);
    
    const documents: VectorDocument[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data() as VectorDocument;
      documents.push(data);
    });
    
    return documents;
  } catch (error) {
    console.error('Error retrieving user embeddings:', error);
    return [];
  }
};

// Perform semantic search to find most relevant documents
export const semanticSearch = async (
  userId: string,
  queryText: string,
  topK: number = 5
): Promise<VectorDocument[]> => {
  try {
    const queryEmbedding = await generateEmbedding(queryText);
    const userDocuments = await getUserEmbeddings(userId);
    
    // Calculate similarity scores
    const documentsWithScores = userDocuments.map(doc => ({
      document: doc,
      similarity: cosineSimilarity(queryEmbedding, doc.embedding)
    }));
    
    // Sort by similarity and return top K
    const sortedDocs = documentsWithScores
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK)
      .filter(item => item.similarity > 0.3); // Filter out low similarity results
    
    const result = sortedDocs.map(item => item.document);
    return result;
  } catch (error) {
    console.error('Error performing semantic search:', error);
    return [];
  }
};

// Delete a specific document from vector database
export const deleteVectorDocument = async (userId: string, documentId: string): Promise<void> => {
  try {
    const docRef = doc(db, EMBEDDINGS_COLLECTION, `${userId}_${documentId}`);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting vector document:', error);
    throw error;
  }
};

// Delete all embeddings for a user
export const deleteUserEmbeddings = async (userId: string): Promise<void> => {
  try {
    const userDocuments = await getUserEmbeddings(userId);
    const deletePromises = userDocuments.map(doc => 
      deleteVectorDocument(userId, doc.id)
    );
    await Promise.all(deletePromises);
  } catch (error) {
    console.error('Error deleting user embeddings:', error);
    throw error;
  }
};

// Convert user data to vector documents for indexing
export const indexUserData = async (userId: string, userData: {
  goals?: Array<{ id: number; title: string; description: string; category: string; status: string; progress?: number }>;
  tasks?: Array<{ id: number; title: string; description: string; category: string; completed: boolean; priority: string }>;
  notes?: Array<{ id: number; title: string; content: string; category: string; tags: string[] }>;
  skills?: Array<{ id: number; name: string; level: string; hoursInvested: number; targetHours: number }>;
  reflections?: Array<{ id: number; content: string; date: string }>;
}): Promise<void> => {
  const documents: Omit<VectorDocument, 'embedding'>[] = [];
  
  // Index goals
  if (userData.goals) {
    userData.goals.forEach(goal => {
      documents.push({
        id: `goal_${goal.id}`,
        text: `Goal: ${goal.title}. Description: ${goal.description}. Category: ${goal.category}. Status: ${goal.status}. Progress: ${goal.progress || 0}%`,
        metadata: {
          type: 'goal',
          userId,
          timestamp: new Date().toISOString(),
          title: goal.title,
          category: goal.category,
          status: goal.status,
          progress: goal.progress
        }
      });
    });
  }
  
  // Index tasks
  if (userData.tasks) {
    userData.tasks.forEach(task => {
      documents.push({
        id: `task_${task.id}`,
        text: `Task: ${task.title}. Description: ${task.description}. Category: ${task.category}. Priority: ${task.priority}. Completed: ${task.completed}`,
        metadata: {
          type: 'task',
          userId,
          timestamp: new Date().toISOString(),
          title: task.title,
          category: task.category,
          priority: task.priority,
          completed: task.completed
        }
      });
    });
  }
  
  // Index notes
  if (userData.notes) {
    userData.notes.forEach(note => {
      documents.push({
        id: `note_${note.id}`,
        text: `Note: ${note.title}. Content: ${note.content}. Category: ${note.category}. Tags: ${note.tags.join(', ')}`,
        metadata: {
          type: 'note',
          userId,
          timestamp: new Date().toISOString(),
          title: note.title,
          category: note.category,
          tags: note.tags
        }
      });
    });
  }
  
  // Index skills
  if (userData.skills) {
    userData.skills.forEach(skill => {
      documents.push({
        id: `skill_${skill.id}`,
        text: `Skill: ${skill.name}. Level: ${skill.level}. Hours invested: ${skill.hoursInvested}. Target hours: ${skill.targetHours}`,
        metadata: {
          type: 'skill',
          userId,
          timestamp: new Date().toISOString(),
          name: skill.name,
          level: skill.level,
          hoursInvested: skill.hoursInvested,
          targetHours: skill.targetHours
        }
      });
    });
  }
  
  // Index reflections
  if (userData.reflections) {
    userData.reflections.forEach(reflection => {
      documents.push({
        id: `reflection_${reflection.id}`,
        text: `Reflection: ${reflection.content}. Date: ${reflection.date}`,
        metadata: {
          type: 'reflection',
          userId,
          timestamp: reflection.date,
          date: reflection.date
        }
      });
    });
  }
  
  // Batch save all documents
  await batchSaveVectorDocuments(userId, documents);
};
