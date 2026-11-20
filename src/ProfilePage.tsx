import { useState } from "react";
import { Check, LogOut, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import type { WorkspaceDevice } from "./lib/deviceStorage";
import "./profile.css";

type Props = {
  email: string;
  devices: WorkspaceDevice[];
  currentDeviceId: string | null;
  loading: boolean;
  error: string;
  cloudEnabled: boolean;
  onRefresh: () => void;
  onSignOutOthers: () => Promise<void>;
  onSignOut: () => void;
};

const formatDate = (value: string) => new Date(value).toLocaleString(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export default function ProfilePage({
  email,
  devices,
  currentDeviceId,
  loading,
  error,
  cloudEnabled,
  onRefresh,
  onSignOutOthers,
  onSignOut,
}: Props) {
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [actionError, setActionError] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  async function signOutOthers() {
    setSigningOut(true);
    setActionError("");
    try {
      await onSignOutOthers();
      setConfirmingSignOut(false);
    } catch (signOutError) {
      setActionError(signOutError instanceof Error ? signOutError.message : "Could not sign out other devices.");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="profile-page">
      <section className="profile-account-card">
        <div className="profile-account-avatar">{email ? email[0].toUpperCase() : "D"}</div>
        <div className="profile-account-details">
          <div className="eyebrow">ACCOUNT</div>
          <h2>{email || "Local workspace"}</h2>
          <p>{cloudEnabled ? "Your resources sync across devices signed in to this account." : "Cloud sync is not configured for this workspace."}</p>
        </div>
        <div className="profile-sync-badge"><ShieldCheck size={15}/>{cloudEnabled ? "Sync enabled" : "Local only"}</div>
      </section>

      <section className="profile-section">
        <div className="profile-section-heading">
          <div>
            <div className="eyebrow">SYNC & SECURITY</div>
            <h2>Your devices</h2>
            <p>Devices signed in to this account can access the same links, notes, and spaces.</p>
          </div>
          <button className="secondary-button" onClick={onRefresh} disabled={loading || !cloudEnabled}>
            <RefreshCw size={14}/> Refresh
          </button>
        </div>

        {!cloudEnabled ? (
          <div className="profile-empty">Add your Supabase settings and sign in to sync resources between devices.</div>
        ) : loading ? (
          <div className="profile-empty">Loading registered devices...</div>
        ) : error ? (
          <div className="profile-error" role="alert">
            <span>{error}</span>
            <button className="secondary-button" onClick={onRefresh}>Try again</button>
          </div>
        ) : devices.length === 0 ? (
          <div className="profile-empty">This device has not been registered yet.</div>
        ) : (
          <div className="device-list">
            {devices.map((device) => {
              const isCurrent = device.device_id === currentDeviceId;
              return (
                <article className="device-row" key={device.device_id}>
                  <span className="device-icon"><Smartphone size={17}/></span>
                  <div className="device-details">
                    <strong>{device.device_name}</strong>
                    <span>{isCurrent ? "This device" : "Last active"} · {formatDate(device.last_active_at)}</span>
                  </div>
                  {isCurrent && <span className="device-current"><Check size={12}/> Current</span>}
                </article>
              );
            })}
          </div>
        )}

        {cloudEnabled && (
          <div className="device-management">
            <div>
              <strong>Sign out other devices</strong>
              <p>Revoke other account sessions. They will be signed out when their session refreshes.</p>
            </div>
            {confirmingSignOut ? (
              <div className="device-confirm-actions">
                <button className="secondary-button" onClick={() => setConfirmingSignOut(false)} disabled={signingOut}>Cancel</button>
                <button className="danger-button" onClick={() => void signOutOthers()} disabled={signingOut}>
                  {signingOut ? "Signing out..." : "Confirm"}
                </button>
              </div>
            ) : (
              <button className="danger-button" onClick={() => setConfirmingSignOut(true)} disabled={!currentDeviceId || signingOut}>
                <LogOut size={14}/> Sign out others
              </button>
            )}
          </div>
        )}
        {actionError && <p className="profile-error-text" role="alert">{actionError}</p>}
      </section>

      <section className="profile-security-note">
        <ShieldCheck size={16}/>
        <p>Only your signed-in account can access its workspace. Keep your sign-in details private on shared devices.</p>
      </section>

      {cloudEnabled && <button className="profile-signout" onClick={onSignOut}><LogOut size={15}/> Sign out of this device</button>}
    </div>
  );
}
