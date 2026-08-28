import React, { useState, useEffect } from 'react';
import { UserProfile, RecipientEmail } from '../types';
import { Mail, Plus, Trash2, CheckCircle2, ShieldCheck, UserCheck, MailCheck, MailX } from 'lucide-react';
import {
  addRecipientEmail,
  removeRecipientEmail,
  updatePrimaryRecipient,
} from '../lib/dataService';

interface RecipientsViewProps {
  user: UserProfile;
  recipients: RecipientEmail[];
}

export const RecipientsView: React.FC<RecipientsViewProps> = ({ user, recipients }) => {
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [primaryEmail, setPrimaryEmail] = useState(user.recipientEmail || user.email || '');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [emailServiceConfigured, setEmailServiceConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    if (user.recipientEmail || user.email) {
      setPrimaryEmail(user.recipientEmail || user.email);
    }
  }, [user.recipientEmail, user.email]);

  useEffect(() => {
    fetch('/api/email/status')
      .then((res) => res.json())
      .then((data) => setEmailServiceConfigured(data.configured === true))
      .catch(() => setEmailServiceConfigured(false));
  }, []);

  const handleAddRecipient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail) return;
    setSaving(true);
    setSuccessMsg(null);
    try {
      await addRecipientEmail(user.uid, newEmail, newName);
      setNewEmail('');
      setNewName('');
      setSuccessMsg(`Added recipient ${newEmail} successfully.`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      alert('Error adding recipient: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSetPrimary = async (email: string) => {
    setSaving(true);
    try {
      await updatePrimaryRecipient(user.uid, email);
      setPrimaryEmail(email);
      setSuccessMsg(`Updated primary report recipient to ${email}.`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      alert('Error updating primary recipient: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRecipient = async (id: string) => {
    if (!confirm('Are you sure you want to remove this report recipient?')) return;
    try {
      await removeRecipientEmail(id);
    } catch (err: any) {
      alert('Error deleting recipient: ' + err.message);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
            <Mail className="w-5 h-5 text-blue-600" />
            <span>Report Recipient Emails</span>
          </h1>
          <p className="text-xs text-slate-500">
            Configure email addresses to automatically receive monthly PDF & Excel usage reports.
          </p>
        </div>

        {emailServiceConfigured === true ? (
          <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-medium self-start sm:self-auto">
            <MailCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>SMTP Service Active</span>
          </span>
        ) : (
          <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs font-medium self-start sm:self-auto">
            <MailX className="w-3.5 h-3.5 text-amber-600" />
            <span>Email Service Not Configured Yet</span>
          </span>
        )}
      </div>

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl text-xs flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Primary Recipient Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-sm">
        <div className="flex items-center space-x-2 text-xs font-bold text-slate-800">
          <UserCheck className="w-4 h-4 text-blue-600" />
          <span>Primary Report Recipient</span>
        </div>

        <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div>
            <div className="text-sm font-semibold text-slate-900">
              {primaryEmail || 'No primary recipient configured yet'}
            </div>
            <div className="text-xs text-slate-500">
              {primaryEmail
                ? 'Primary delivery address for automated monthly reports'
                : 'Add a recipient below to configure report delivery'}
            </div>
          </div>
          {primaryEmail ? (
            <span className="bg-blue-50 text-blue-700 text-[10px] font-bold px-2.5 py-1 rounded-full border border-blue-200">
              PRIMARY
            </span>
          ) : (
            <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2.5 py-1 rounded-full border border-slate-200">
              UNSET
            </span>
          )}
        </div>
      </div>

      {/* Add New Recipient Form */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
        <h2 className="text-xs font-bold text-slate-800">Add Report Recipient Email</h2>

        <form onSubmit={handleAddRecipient} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
            <input
              type="email"
              required
              placeholder="e.g. manager@company.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Recipient Name / Label</label>
            <input
              type="text"
              placeholder="e.g. IT Supervisor"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-600"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium text-xs transition disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            <span>Add Recipient</span>
          </button>
        </form>
      </div>

      {/* Recipients List Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-200">
          <span className="text-xs font-bold text-slate-800">Configured Recipients ({recipients.length})</span>
        </div>

        <div className="divide-y divide-slate-200">
          {recipients.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">No additional recipients configured</div>
          ) : (
            recipients.map((rec) => {
              const isPrimary = rec.email === primaryEmail;
              return (
                <div key={rec.recipientId} className="p-4 flex items-center justify-between hover:bg-slate-50 transition">
                  <div className="space-y-0.5">
                    <div className="text-xs font-semibold text-slate-900 flex items-center space-x-2">
                      <span>{rec.email}</span>
                      {isPrimary && (
                        <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                          Primary
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500">{rec.name || 'Recipient'}</div>
                  </div>

                  <div className="flex items-center space-x-3">
                    {!isPrimary && (
                      <button
                        onClick={() => handleSetPrimary(rec.email)}
                        className="text-xs text-blue-600 hover:text-blue-700 font-semibold"
                      >
                        Set Primary
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteRecipient(rec.recipientId)}
                      className="text-slate-400 hover:text-rose-600 transition"
                      title="Remove Recipient"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

    </div>
  );
};
