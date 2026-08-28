/**
 * Customer & Production Cleanup Script for SYSTEM USAGE LOGGER PRO
 * 
 * Safely purges all past test data, development artifacts, simulated devices,
 * sample reports, and test email logs from Firestore in chunks of 450 documents.
 * 
 * Preserves user accounts in /users/{uid} and resets their onboarding/email dispatch flags.
 */

const { initializeApp, getApps, getApp } = require('firebase/app');
const {
  getFirestore,
  collection,
  getDocs,
  writeBatch,
  doc,
  setDoc,
} = require('firebase/firestore');
const fs = require('fs');
const path = require('path');

// Read Firebase configuration
const configPath = path.join(__dirname, '..', 'firebase-applet-config.json');
if (!fs.existsSync(configPath)) {
  console.error('[ERROR] firebase-applet-config.json not found at:', configPath);
  process.exit(1);
}

const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
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
  'recipient_emails',
  'reportRecipients',
  'email_logs',
  'notifications',
];

const CHUNK_SIZE = 450;

async function purgeCollection(collectionName) {
  console.log(`\n========================================`);
  console.log(`[PURGE] Processing collection: '${collectionName}'...`);
  
  try {
    const colRef = collection(db, collectionName);
    const snapshot = await getDocs(colRef);
    const totalDocs = snapshot.size;

    console.log(`[INFO] Found ${totalDocs} document(s) in '${collectionName}'.`);
    if (totalDocs === 0) {
      console.log(`[CLEAN] Collection '${collectionName}' is already empty.`);
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
        console.log(`[PROGRESS] Deleted chunk of ${countInBatch} docs from '${collectionName}' (${deletedCount}/${totalDocs})`);
        batch = writeBatch(db);
        countInBatch = 0;
      }
    }

    if (countInBatch > 0) {
      await batch.commit();
      console.log(`[PROGRESS] Deleted final chunk of ${countInBatch} docs from '${collectionName}' (${deletedCount}/${totalDocs})`);
    }

    console.log(`[SUCCESS] Purged all ${deletedCount} document(s) from '${collectionName}'.`);
    return deletedCount;
  } catch (err) {
    console.error(`[ERROR] Failed to purge collection '${collectionName}':`, err.message);
    throw err;
  }
}

async function resetUsersOnboardingFlags() {
  console.log(`\n========================================`);
  console.log(`[USER RESET] Scanning '/users' collection...`);

  try {
    const colRef = collection(db, 'users');
    const snapshot = await getDocs(colRef);
    const totalUsers = snapshot.size;

    console.log(`[INFO] Found ${totalUsers} user profile(s) to reset.`);
    if (totalUsers === 0) {
      console.log(`[INFO] No user profiles found in database.`);
      return 0;
    }

    let resetCount = 0;
    let batch = writeBatch(db);
    let countInBatch = 0;

    for (const userDoc of snapshot.docs) {
      const data = userDoc.data();
      const userEmail = data.email || '';

      const resetFields = {
        welcomeEmailSent: false,
        welcomeEmailSentAt: null,
        welcomeEmailMessageId: null,
        trialReportGenerated: false,
        trialPdfStoragePath: null,
        trialExcelStoragePath: null,
        recipientEmail: userEmail,
        onboardingCompleted: false,
        onboardingStep: 1,
        sampleDataProvisioned: false,
        trialStatus: 'active',
        trialDaysTotal: 7,
        trialDaysRemaining: 7,
      };

      batch.set(userDoc.ref, resetFields, { merge: true });
      countInBatch++;
      resetCount++;

      if (countInBatch >= CHUNK_SIZE) {
        await batch.commit();
        console.log(`[PROGRESS] Reset onboarding flags for batch of ${countInBatch} user(s) (${resetCount}/${totalUsers})`);
        batch = writeBatch(db);
        countInBatch = 0;
      }
    }

    if (countInBatch > 0) {
      await batch.commit();
      console.log(`[PROGRESS] Reset onboarding flags for final batch of ${countInBatch} user(s) (${resetCount}/${totalUsers})`);
    }

    console.log(`[SUCCESS] Successfully reset onboarding and email dispatch flags for ${resetCount} user(s).`);
    return resetCount;
  } catch (err) {
    console.error(`[ERROR] Failed to reset user onboarding flags:`, err.message);
    throw err;
  }
}

async function main() {
  console.log(`****************************************************`);
  console.log(` SYSTEM USAGE LOGGER PRO — DATABASE PURGE & RESET   `);
  console.log(`****************************************************`);
  console.log(`Project ID: ${firebaseConfig.projectId}`);

  const purgeSummary = {};

  for (const colName of TARGET_COLLECTIONS) {
    const deleted = await purgeCollection(colName);
    purgeSummary[colName] = deleted;
  }

  const usersReset = await resetUsersOnboardingFlags();

  console.log(`\n========================================`);
  console.log(` CLEANUP COMPLETE — FINAL AUDIT REPORT  `);
  console.log(`========================================`);
  console.table(purgeSummary);
  console.log(`User Accounts Reset: ${usersReset}`);
  console.log(`[STATUS] All test artifacts, devices, events, sessions, reports, recipient emails, and logs have been completely purged.`);
  console.log(`[STATUS] Schemas and Firestore rules remain intact. System is pristine for fresh customer usage.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[FATAL] Cleanup script failed:', err);
  process.exit(1);
});
