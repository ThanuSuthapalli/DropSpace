import { useState, type FormEvent } from "react";
import { supabase } from "./lib/supabase";
import "./auth.css";

export default function AuthScreen({ initialError = "" }: { initialError?: string }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setError("Supabase is not configured. Add its URL and publishable key to .env.local.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (isSignUp) {
        const { error: authError } = await supabase.auth.signUp({ email, password });
        if (authError) throw authError;
        setMessage("Account created. Check your email to confirm your account, then sign in.");
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="brand">
          <div className="brand-mark">d.</div>
          <div>
            <div className="brand-name">dropspace<span>.</span></div>
            <div className="brand-caption">YOUR DIGITAL DESK</div>
          </div>
        </div>
        <h1>{isSignUp ? "Create your account" : "Welcome back"}</h1>
        <p>Sign in to sync your workspace securely with Supabase.</p>
        <form onSubmit={submit}>
          <label className="form-label" htmlFor="auth-email">EMAIL</label>
          <input
            id="auth-email"
            className="form-input"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <label className="form-label" htmlFor="auth-password">PASSWORD</label>
          <input
            id="auth-password"
            className="form-input"
            type="password"
            autoComplete={isSignUp ? "new-password" : "current-password"}
            minLength={6}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error && <p className="auth-error" role="alert">{error}</p>}
          {message && <p className="auth-message" role="status">{message}</p>}
          <button className="primary-button auth-submit" type="submit" disabled={busy}>
            {busy ? "Please wait..." : isSignUp ? "Create account" : "Sign in"}
          </button>
        </form>
        <button
          className="auth-toggle"
          type="button"
          onClick={() => {
            setIsSignUp((value) => !value);
            setError("");
            setMessage("");
          }}
        >
          {isSignUp ? "Already have an account? Sign in" : "New to DropSpace? Create an account"}
        </button>
      </section>
    </main>
  );
}
