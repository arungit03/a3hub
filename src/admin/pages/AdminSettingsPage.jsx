import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../state/auth";
import { AUDIT_ACTIONS, logAuditEvent } from "../lib/auditLogs";

const SETTINGS_DOC_ID = "modules";
const DEFAULT_SETTINGS = {
  aiEnabled: true,
  canteenEnabled: true,
  codingPracticeEnabled: true,
  placementModuleEnabled: true,
};

const SETTING_FIELDS = [
  {
    key: "aiEnabled",
    title: "AI Module",
    description: "Enable AI assistant features across the platform.",
  },
  {
    key: "canteenEnabled",
    title: "Canteen Module",
    description: "Enable canteen ordering/management module.",
  },
  {
    key: "codingPracticeEnabled",
    title: "Coding Practice",
    description: "Enable coding tools and practice module.",
  },
  {
    key: "placementModuleEnabled",
    title: "Placement Module",
    description: "Enable placement and career tracking module.",
  },
];

export default function AdminSettingsPage() {
  const { user, profile } = useAuth();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);

  const performedBy = useMemo(
    () => ({
      uid: user?.uid || "",
      name: profile?.name || user?.displayName || user?.email || "Admin",
      email: user?.email || "",
      role: profile?.role || "admin",
    }),
    [profile?.name, profile?.role, user?.displayName, user?.email, user?.uid]
  );

  useEffect(() => {
    const settingsRef = doc(db, "systemSettings", SETTINGS_DOC_ID);
    const unsubscribe = onSnapshot(
      settingsRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setSettings(DEFAULT_SETTINGS);
        } else {
          const data = snapshot.data() || {};
          setSettings({
            aiEnabled: Boolean(data.aiEnabled),
            canteenEnabled: Boolean(data.canteenEnabled),
            codingPracticeEnabled: Boolean(data.codingPracticeEnabled),
            placementModuleEnabled: Boolean(data.placementModuleEnabled),
          });
        }
        setLoading(false);
      },
      () => {
        setLoading(false);
        setStatusMessage("Unable to load system settings.");
      }
    );

    return () => unsubscribe();
  }, []);

  const handleToggle = (key) => {
    setSettings((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
    setStatusMessage("");
  };

  const handleSave = async () => {
    if (saveBusy) return;
    setSaveBusy(true);
    setStatusMessage("");
    try {
      await setDoc(
        doc(db, "systemSettings", SETTINGS_DOC_ID),
        {
          ...settings,
          updatedAt: serverTimestamp(),
          updatedBy: user?.uid || null,
        },
        { merge: true }
      );

      await logAuditEvent({
        db,
        action: AUDIT_ACTIONS.SETTINGS_UPDATED,
        module: "settings",
        targetId: SETTINGS_DOC_ID,
        performedBy,
        metadata: settings,
      }).catch(() => {});

      setStatusMessage("System settings updated.");
    } catch {
      setStatusMessage("Unable to save system settings.");
    } finally {
      setSaveBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          Feature Toggles
        </p>
        <h2 className="text-2xl font-bold text-slate-900">System Settings</h2>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {loading ? (
          <p className="text-sm text-slate-500">Loading settings...</p>
        ) : (
          <div className="space-y-3">
            {SETTING_FIELDS.map((item) => (
              <div
                key={item.key}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  <p className="text-xs text-slate-500">{item.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggle(item.key)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    settings[item.key]
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {settings[item.key] ? "Enabled" : "Disabled"}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={saveBusy || loading}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saveBusy ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </section>

      {statusMessage ? (
        <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
          {statusMessage}
        </p>
      ) : null}
    </div>
  );
}
