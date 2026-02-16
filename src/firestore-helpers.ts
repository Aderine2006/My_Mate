import { db } from './firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';

// Generic type for all data collections
export type DataType = 'goals' | 'skills' | 'deadlinePlans' | 'contents' | 'scheduleTasks' | 'dailyTasks' | 'manualNotes' | 'streak' | 'budgetIncomes' | 'budgetExpenses' | 'budgetLimits' | 'budgetGoals';

/**
 * Save data to Firestore for a specific user
 * @param userId - The user's unique ID
 * @param dataType - The type of data being saved
 * @param data - The data to save
 */
export const saveToFirestore = async (userId: string, dataType: DataType, data: any): Promise<void> => {
    try {
        const docRef = doc(db, 'users', userId, 'data', dataType);
        await setDoc(docRef, {
            content: data,
            updatedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error(`Error saving ${dataType} to Firestore:`, error);
        throw error;
    }
};

/**
 * Load data from Firestore for a specific user
 * @param userId - The user's unique ID
 * @param dataType - The type of data to load
 * @returns The data from Firestore, or null if not found
 */
export const loadFromFirestore = async (userId: string, dataType: DataType): Promise<any> => {
    try {
        const docRef = doc(db, 'users', userId, 'data', dataType);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            return data.content;
        } else {
            return null;
        }
    } catch (error) {
        console.error(`Error loading ${dataType} from Firestore:`, error);
        throw error;
    }
};

/**
 * Migrate data from localStorage to Firestore
 * @param userId - The user's unique ID
 */
export const migrateLocalStorageToFirestore = async (userId: string): Promise<void> => {
    const dataTypes: DataType[] = ['goals', 'skills', 'deadlinePlans', 'contents', 'scheduleTasks', 'dailyTasks', 'manualNotes', 'streak'];

    try {
        for (const dataType of dataTypes) {
            const localStorageKey = `${dataType}-${userId}`;
            const localData = localStorage.getItem(localStorageKey);

            if (localData) {
                try {
                    const parsedData = JSON.parse(localData);
                    await saveToFirestore(userId, dataType, parsedData);
                    console.log(`✅ Migrated ${dataType} to Firestore`);
                } catch (parseError) {
                    console.error(`Error parsing ${dataType} from localStorage:`, parseError);
                }
            }
        }

        // Mark migration as complete
        localStorage.setItem(`migrated-to-firestore-${userId}`, 'true');
        console.log('✅ Migration complete!');
    } catch (error) {
        console.error('Error during migration:', error);
        throw error;
    }
};

/**
 * Check if user has already migrated their data
 * @param userId - The user's unique ID
 * @returns true if migrated, false otherwise
 */
export const hasUserMigrated = (userId: string): boolean => {
    return localStorage.getItem(`migrated-to-firestore-${userId}`) === 'true';
};
