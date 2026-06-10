import React, { useState, useEffect } from 'react';
import { FaLock, FaEye, FaEyeSlash, FaCheckCircle, FaTimesCircle } from 'react-icons/fa';
import api from '../utils/api';
import './ResetPassword.css';

const ResetPassword = ({ showToast, onDone }) => {
  const [token, setToken]               = useState('');
  const [email, setEmail]               = useState('');
  const [newPassword, setNewPassword]   = useState('');
  const [confirmPass, setConfirmPass]   = useState('');
  const [showNew, setShowNew]           = useState(false);
  const [showConfirm, setShowConfirm]   = useState(false);
  const [loading, setLoading]           = useState(false);
  const [success, setSuccess]           = useState(false);
  const [tokenError, setTokenError]     = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('reset_token');
    const e = params.get('email');
    if (!t || !e) {
      setTokenError(true);
    } else {
      setToken(t);
      setEmail(e);
    }
  }, []);

  const strength = (() => {
    if (!newPassword) return 0;
    let s = 0;
    if (newPassword.length >= 6)  s++;
    if (newPassword.length >= 10) s++;
    if (/[A-Z]/.test(newPassword)) s++;
    if (/[0-9]/.test(newPassword)) s++;
    if (/[^A-Za-z0-9]/.test(newPassword)) s++;
    return s;
  })();

  const strengthLabel = ['', 'Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'][strength];
  const strengthColor = ['', '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#27ae60'][strength];

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (newPassword.length < 6) {
      showToast('Password must be at least 6 characters.', 'error');
      return;
    }
    if (newPassword !== confirmPass) {
      showToast('Passwords do not match.', 'error');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, email, newPassword });
      setSuccess(true);
      showToast('Password updated! You can now log in.', 'success');
      // Clear the reset params from the URL so a refresh doesn't re-show this screen
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (err) {
      if (err.message && err.message.toLowerCase().includes('invalid')) {
        setTokenError(true);
      }
      showToast(err.message || 'Failed to reset password.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ── Invalid / missing token ────────────────────────────────────────────
  if (tokenError) {
    return (
      <div className="rp-container">
        <div className="rp-card rp-error-card">
          <FaTimesCircle className="rp-icon rp-icon-error" />
          <h2>Invalid or Expired Link</h2>
          <p>
            This password reset link is either invalid or has expired.<br />
            Reset links are only valid for <strong>1 hour</strong>.
          </p>
          <button className="rp-btn rp-btn-primary" onClick={onDone}>
            Request a New Link
          </button>
        </div>
      </div>
    );
  }

  // ── Success ───────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="rp-container">
        <div className="rp-card rp-success-card">
          <FaCheckCircle className="rp-icon rp-icon-success" />
          <h2>Password Updated!</h2>
          <p>Your password has been changed successfully.<br />You can now sign in with your new password.</p>
          <button className="rp-btn rp-btn-primary" onClick={onDone}>
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  // ── Reset form ─────────────────────────────────────────────────────────
  return (
    <div className="rp-container">
      <div className="rp-brand">CollabCode</div>

      <div className="rp-card">
        <div className="rp-header">
          <div className="rp-lock-icon">🔑</div>
          <h1>Reset Your Password</h1>
          <p className="rp-sub">
            Resetting password for <strong>{email}</strong>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="rp-form">
          {/* New Password */}
          <div className="rp-field">
            <label htmlFor="rp-new-pass">New Password</label>
            <div className="rp-input-wrap">
              <FaLock className="rp-input-icon" />
              <input
                id="rp-new-pass"
                type={showNew ? 'text' : 'password'}
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoFocus
              />
              <button
                type="button"
                className="rp-eye-btn"
                onClick={() => setShowNew(!showNew)}
                tabIndex={-1}
              >
                {showNew ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>

            {/* Strength bar */}
            {newPassword && (
              <div className="rp-strength">
                <div className="rp-strength-bar">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className="rp-strength-seg"
                      style={{ background: i <= strength ? strengthColor : 'rgba(255,255,255,0.1)' }}
                    />
                  ))}
                </div>
                <span className="rp-strength-label" style={{ color: strengthColor }}>
                  {strengthLabel}
                </span>
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div className="rp-field">
            <label htmlFor="rp-confirm-pass">Confirm Password</label>
            <div className="rp-input-wrap">
              <FaLock className="rp-input-icon" />
              <input
                id="rp-confirm-pass"
                type={showConfirm ? 'text' : 'password'}
                placeholder="Repeat new password"
                value={confirmPass}
                onChange={(e) => setConfirmPass(e.target.value)}
              />
              <button
                type="button"
                className="rp-eye-btn"
                onClick={() => setShowConfirm(!showConfirm)}
                tabIndex={-1}
              >
                {showConfirm ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
            {confirmPass && newPassword !== confirmPass && (
              <span className="rp-mismatch">Passwords do not match</span>
            )}
            {confirmPass && newPassword === confirmPass && (
              <span className="rp-match">✓ Passwords match</span>
            )}
          </div>

          <button
            id="rp-submit-btn"
            type="submit"
            className="rp-btn rp-btn-primary"
            disabled={loading}
            style={{ opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Updating…' : '🔒 Update Password'}
          </button>

          <button type="button" className="rp-cancel-link" onClick={onDone}>
            Cancel — back to login
          </button>
        </form>
      </div>
    </div>
  );
};

export default ResetPassword;
