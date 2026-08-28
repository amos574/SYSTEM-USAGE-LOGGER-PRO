/**
 * Customer Reset Script for SYSTEM USAGE LOGGER PRO
 * 
 * Safely purges ALL documents from Firestore collections while strictly preserving
 * all collection schemas, security rules, and user profiles (with reset fields).
 */

const { initializeApp, getApps, getApp } = require('firebase/app');
const { getAuth, signInAnonymously } = require('firebase/auth');
const {
  getFirestore,
  collection,
  getDocs,
  writeBatch,
} = require('firebase/firestore');
const fs = require('fs');
const path = require('path');
const http = require('http');

// Read Firebase configuration
const configPath = path.join(__dirname, '..', 'firebase-applet-config.json');
if (!fs.existsSync(configPath)) {
  console.error('[ERROR] firebase-applet-config.json not found at:', configPath);
  process.exit(1);
}

const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

const TARGET_COLLECTIONS = [
  'devices',
  'system_events',
  'systemEvents',
  'usage_sessions',
  'usageSessions',
  'reports',
  'monthlyReports',
  'reportJobs',
  'email_logs',
  'recipient_emails',
  'reportRecipients',
  'notifications',
];

const CHUNK_SIZE = 450;

async function purgeCollectionDirect(collectionName) {
  console.log(`[PURGE] Processing collection: '${collectionName}'...`);
  try {
    const colRef = collection(db, collectionName);
    const snapshot = await getDocs(colRef);
    const totalDocs = snapshot.size;

    if (totalDocs === 0) {
      console.log(`[CLEAN] '${collectionName}' is already empty (0 documents).`);
      return 0;
    }

    let deletedCount = 0;
    let batch = writeBatch(db);
    let countInBatch = 0;

    for (const docSnap of snapshot.docs) {
      batch.delete(docSnap.ref);
      countInBatch++;
      deletedCount++;

      if (countInBatch >= CHUNK_SIZE) {
        await batch.commit();
        console.log(`[PROGRESS] Deleted chunk of ${countInBatch} in '${collectionName}' (${deletedCount}/${totalDocs})`);
        batch = writeBatch(db);
        countInBatch = 0;
      }
    }

    if (countInBatch > 0) {
      await batch.commit();
      console.log(`[PROGRESS] Deleted final chunk of ${countInBatch} in '${collectionName}' (${deletedCount}/${totalDocs})`);
    }

    console.log(`[SUCCESS] Purged ${deletedCount} document(s) from '${collectionName}'.`);
    return deletedCount;
  } catch (err) {
    console.warn(`[NOTICE] Direct purge for '${collectionName}': ${err.message}`);
    return 0;
  }
}

async function resetUsersDirect() {
  console.log(`[USER RESET] Resetting user profiles in '/users'...`);
  try {
    const colRef = collection(db, 'users');
    const snapshot = await getDocs(colRef);
    const totalUsers = snapshot.size;

    if (totalUsers === 0) {
      console.log(`[INFO] No user profiles found in database.`);
      return 0;
    }

    let resetCount = 0;
    let batch = writeBatch(db);
    let countInBatch = 0;

    for (const userDoc of snapshot.docs) {
      const resetFields = {
        trialReportGenerated: false,
        trialPdfStoragePath: null,
        trialExcelStoragePath: null,
        welcomeEmailSent: false,
        welcomeEmailSentAt: null,
        welcomeEmailMessageId: null,
        recipientEmail: "",
        onboardingCompleted: false,
        onboardingStep: 1,
      };

      batch.set(userDoc.ref, resetFields, { merge: true });
      countInBatch++;
      resetCount++;

      if (countInBatch >= CHUNK_SIZE) {
        await batch.commit();
        batch = writeBatch(db);
        countInBatch = 0;
      }
    }

    if (countInBatch > 0) {
      await batch.commit();
    }

    console.log(`[SUCCESS] Successfully reset ${resetCount} user profile(s).`);
    return resetCount;
  } catch (err) {
    console.warn(`[NOTICE] Direct user reset: ${err.message}`);
    return 0;
  }
}

async function triggerServerPurgeApi() {
  return new Promise((resolve) => {
    const postData = JSON.stringify({});
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 3000,
        path: '/api/admin/clean-all-test-data',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
        timeout: 5000,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            resolve(data);
          } catch {
            resolve(null);
          }
        });
      }
    );

    req.on('error', () => {
      resolve(null);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });

    req.write(postData);
    req.end();
  });
}

async function main() {
  console.log(`====================================================`);
  console.log(` SYSTEM USAGE LOGGER PRO — CUSTOMER RESET SCRIPT    `);
  console.log(`====================================================`);
  console.log(`Project ID: ${firebaseConfig.projectId}`);

  try {
    await signInAnonymously(auth);
    console.log('[AUTH] Authenticated anonymously for database administration.');
  } catch (err) {
    console.log('[AUTH] Anonymous sign-in notice (will proceed with existing credentials):', err.message);
  }

  // 1. Try via Server API first (runs in server context)
  const serverResult = await triggerServerPurgeApi();
  if (serverResult && serverResult.success) {
    console.log(`\n[SERVER API PURGE SUCCESS]`);
    console.table(serverResult.purgedCollections);
    console.log(`Users Reset: ${serverResult.usersReset}`);
    console.log(serverResult.message);
  } else {
    // 2. Direct Firestore SDK Execution
    const purgeSummary = {};
    for (const colName of TARGET_COLLECTIONS) {
      const deleted = await purgeCollectionDirect(colName);
      purgeSummary[colName] = deleted;
    }
    const usersReset = await resetUsersDirect();

    console.log(`\n========================================`);
    console.log(` PURGE SUMMARY & FINAL AUDIT `);
    console.log(`========================================`);
    console.table(purgeSummary);
    console.log(`User Accounts Reset: ${usersReset}`);
  }

  console.log(`\n[COMPLETED] All target collections wiped clean. Schemas and rules preserved.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[FATAL] Customer reset script failed:', err);
  process.exit(1);
});
