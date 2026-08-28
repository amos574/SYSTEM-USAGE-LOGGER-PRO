import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import firebaseConfigJson from '../../firebase-applet-config.json';

// Initialize Firebase Admin App if not already initialized
let adminApp: App;
if (!getApps().length) {
  try {
    adminApp = initializeApp({
      projectId: firebaseConfigJson.projectId || 'system-usage-logger-pro',
    });
  } catch (err) {
    console.warn('[FIREBASE_ADMIN] Default init notice:', err);
    adminApp = initializeApp();
  }
} else {
  adminApp = getApps()[0];
}

export const NAMED_DB_ID = (firebaseConfigJson as any).firestoreDatabaseId || 'ai-studio-systemusagelogge-d54ed719-4af6-4b51-a8c0-d8d482a8f242';

// 1. Create handle for Named Database instance
export let namedDb: Firestore;
try {
  namedDb = getFirestore(adminApp, NAMED_DB_ID);
} catch (e: any) {
  console.warn(`[FIREBASE_ADMIN] Named DB (${NAMED_DB_ID}) init notice, falling back:`, e?.message);
  try {
    namedDb = getFirestore(NAMED_DB_ID);
  } catch {
    namedDb = getFirestore(adminApp);
  }
}

// 2. Create handle for Default Database instance
export let defaultDb: Firestore;
try {
  defaultDb = getFirestore(adminApp);
} catch (e: any) {
  console.warn('[FIREBASE_ADMIN] Default DB init notice:', e?.message);
  defaultDb = getFirestore();
}

/**
 * Master multi-write helper ensuring no document is lost regardless of DB routing configuration.
 * Concurrently writes to BOTH the named and default database instances.
 */
export async function multiDbSet(collectionName: string, docId: string, data: any): Promise<void> {
  const promises = [
    namedDb
      .collection(collectionName)
      .doc(docId)
      .set(data, { merge: true })
      .catch((err) => console.error(`[NAMED DB SET ERROR] ${collectionName}/${docId}:`, err.message)),
    defaultDb
      .collection(collectionName)
      .doc(docId)
      .set(data, { merge: true })
      .catch((err) => console.error(`[DEFAULT DB SET ERROR] ${collectionName}/${docId}:`, err.message)),
  ];
  await Promise.allSettled(promises);
}

/**
 * Master multi-add helper ensuring auto-generated documents exist in both database partitions.
 */
export async function multiDbAdd(collectionName: string, data: any): Promise<string | null> {
  let createdId: string | null = null;
  try {
    const docRef = namedDb.collection(collectionName).doc();
    createdId = docRef.id;
    const promises = [
      docRef.set(data).catch((err) => console.error(`[NAMED DB ADD ERROR] ${collectionName}:`, err.message)),
      defaultDb
        .collection(collectionName)
        .doc(docRef.id)
        .set(data)
        .catch((err) => console.error(`[DEFAULT DB ADD ERROR] ${collectionName}:`, err.message)),
    ];
    await Promise.allSettled(promises);
  } catch (err: any) {
    console.error(`[MULTI_DB_ADD FATAL] ${collectionName}:`, err.message);
  }
  return createdId;
}

/**
 * Master multi-delete helper ensuring documents are purged across all database partitions.
 */
export async function multiDbDelete(collectionName: string, docId: string): Promise<void> {
  const promises = [
    namedDb
      .collection(collectionName)
      .doc(docId)
      .delete()
      .catch((err) => console.error(`[NAMED DB DELETE ERROR] ${collectionName}/${docId}:`, err.message)),
    defaultDb
      .collection(collectionName)
      .doc(docId)
      .delete()
      .catch((err) => console.error(`[DEFAULT DB DELETE ERROR] ${collectionName}/${docId}:`, err.message)),
  ];
  await Promise.allSettled(promises);
}

/**
 * Master resilient document getter: reads from named DB first, with immediate fallback to default DB.
 */
export async function multiDbGetDoc(collectionName: string, docId: string): Promise<any | null> {
  try {
    const snap = await namedDb.collection(collectionName).doc(docId).get();
    if (snap.exists) {
      return { id: snap.id, ...snap.data() };
    }
  } catch (err: any) {
    console.warn(`[NAMED DB GET NOTICE] ${collectionName}/${docId}:`, err.message);
  }

  try {
    const defaultSnap = await defaultDb.collection(collectionName).doc(docId).get();
    if (defaultSnap.exists) {
      return { id: defaultSnap.id, ...defaultSnap.data() };
    }
  } catch (err: any) {
    console.warn(`[DEFAULT DB GET NOTICE] ${collectionName}/${docId}:`, err.message);
  }

  return null;
}

/**
 * Master resilient collection reader: merges unique documents across both partitions.
 */
export async function multiDbGetDocs(collectionName: string, filterField?: string, filterVal?: any): Promise<any[]> {
  const docsMap = new Map<string, any>();

  // 1. Query Named DB
  try {
    let q: FirebaseFirestore.Query = namedDb.collection(collectionName);
    if (filterField && filterVal !== undefined) {
      q = q.where(filterField, '==', filterVal);
    }
    const snap = await q.get();
    snap.forEach((doc) => {
      docsMap.set(doc.id, { id: doc.id, ...doc.data() });
    });
  } catch (err: any) {
    console.warn(`[NAMED DB QUERY NOTICE] ${collectionName}:`, err.message);
  }

  // 2. Query Default DB and merge missing docs
  try {
    let q: FirebaseFirestore.Query = defaultDb.collection(collectionName);
    if (filterField && filterVal !== undefined) {
      q = q.where(filterField, '==', filterVal);
    }
    const snap = await q.get();
    snap.forEach((doc) => {
      if (!docsMap.has(doc.id)) {
        docsMap.set(doc.id, { id: doc.id, ...doc.data() });
      }
    });
  } catch (err: any) {
    console.warn(`[DEFAULT DB QUERY NOTICE] ${collectionName}:`, err.message);
  }

  return Array.from(docsMap.values());
}

/**
 * Master multi-batch writer ensuring atomic batched sets and deletes across both partitions.
 */
export async function multiDbBatchWrite(
  operations: Array<{ collection: string; docId: string; data?: any; operation?: 'set' | 'delete' }>
): Promise<void> {
  if (!operations || operations.length === 0) return;

  const namedBatch = namedDb.batch();
  const defaultBatch = defaultDb.batch();

  for (const op of operations) {
    const namedRef = namedDb.collection(op.collection).doc(op.docId);
    const defaultRef = defaultDb.collection(op.collection).doc(op.docId);

    if (op.operation === 'delete') {
      namedBatch.delete(namedRef);
      defaultBatch.delete(defaultRef);
    } else {
      namedBatch.set(namedRef, op.data || {}, { merge: true });
      defaultBatch.set(defaultRef, op.data || {}, { merge: true });
    }
  }

  await Promise.allSettled([
    namedBatch.commit().catch((err) => console.error('[NAMED DB BATCH COMMIT ERROR]:', err?.message)),
    defaultBatch.commit().catch((err) => console.error('[DEFAULT DB BATCH COMMIT ERROR]:', err?.message)),
  ]);
}

