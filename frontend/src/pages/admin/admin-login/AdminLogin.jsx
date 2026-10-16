import { useEffect, useId, useRef, useState } from 'react';
import OAuthProviders from './oauth/OAuthProviders.jsx';
import './AdminLogin.css';

/* ---------- icons ---------- */
const ShieldIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.9 7.5-9.5V6L12 3Z" />
    <path d="m9 12 2.2 2.2L15.5 10" />
  </svg>
);
const EyeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const EyeOffIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 3l18 18" />
    <path d="M10.6 5.1A9.8 9.8 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4.4-1" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </svg>
);

/* ---------- validation ---------- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(values, identifierMode) {
  const errors = {};
  const id = values.identifier.trim();

  if (identifierMode !== 'none') {
    if (!id) {
      errors.identifier =
        identifierMode === 'email' ? 'Enter your admin email address.'
        : identifierMode === 'username' ? 'Enter your admin username.'
        : 'Enter your admin email or username.';
    } else if (identifierMode === 'email' && !EMAIL_RE.test(id)) {
      errors.identifier = 'Enter a valid email address, like name@company.com.';
    } else if (identifierMode === 'either' && id.includes('@') && !EMAIL_RE.test(id)) {
      errors.identifier = 'That email address looks incomplete. Check for typos.';
    } else if (identifierMode !== 'email' && id.length < 3) {
      errors.identifier = 'Must be at least 3 characters.';
    }
  }

  // Deliberately no complexity rules here: the server decides what a valid password is.
  if (!values.password) errors.password = 'Enter your password.';

  return errors;
}

/**
 * AdminLogin
 *
 * Props
 *   onSubmit({ identifier, password, remember }) -> Promise
 *       YOU supply this and call your existing admin login API inside it.
 *       Resolve on success; throw (or reject with) an Error whose .message is safe to show on failure.
 *       If omitted, the form shows a "not connected" error: it never fakes a login.
 *   onSuccess(result)       called after onSubmit resolves (e.g. navigate to the dashboard)
 *   identifierMode          'either' (default) | 'email' | 'username' | 'none'
 *   forgotPasswordHref      link target for "Forgot password?"; pass null to hide it
 *   onForgotPassword        optional click handler (use instead of an href with a router)
 *   oauthProviders          optional provider list; defaults to oauth/providers.config.js
 *   initialError            message to show on load (e.g. from a ?error= param after an OAuth redirect)
 *   showRememberMe          default true
 *   title, subtitle         copy overrides
 */
export default function AdminLogin({
  onSubmit,
  onSuccess,
  identifierMode = 'either',
  forgotPasswordHref = '/admin/forgot-password',
  onForgotPassword,
  oauthProviders,
  initialError = '',
  showRememberMe = true,
  title = 'Admin Portal',
  subtitle = 'Sign in to manage customer onboarding and payment verification.',
}) {
  const uid = useId();
  const ids = {
    identifier: `${uid}-identifier`,
    password: `${uid}-password`,
    idErr: `${uid}-identifier-err`,
    pwErr: `${uid}-password-err`,
    formErr: `${uid}-form-err`,
  };

  const [values, setValues] = useState({ identifier: '', password: '', remember: false });
  const [touched, setTouched] = useState({});
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState(initialError);

  const identifierRef = useRef(null);
  const passwordRef = useRef(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const identifierLabel =
    identifierMode === 'email' ? 'Email address' : identifierMode === 'username' ? 'Username' : 'Email or username';

  function update(field, value) {
    const next = { ...values, [field]: value };
    setValues(next);
    if (touched[field]) setErrors(validate(next, identifierMode));
    if (formError) setFormError('');
  }

  function blur(field) {
    setTouched((t) => ({ ...t, [field]: true }));
    setErrors(validate(values, identifierMode));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (loading) return;

    const found = validate(values, identifierMode);
    setErrors(found);
    setTouched(identifierMode === 'none' ? { password: true } : { identifier: true, password: true });
    if (found.identifier) return identifierRef.current?.focus();
    if (found.password) return passwordRef.current?.focus();

    setLoading(true);
    setFormError('');
    try {
      if (typeof onSubmit !== 'function') {
        throw new Error('Sign-in is not connected yet. Pass an onSubmit handler to AdminLogin.');
      }
      const result = await onSubmit({
        identifier: values.identifier.trim(),
        password: values.password,
        remember: values.remember,
      });
      onSuccess?.(result);
    } catch (err) {
      if (!mounted.current) return;
      setFormError(err?.message || 'We couldn’t sign you in. Try again in a moment.');
      setValues((v) => ({ ...v, password: '' }));
      setShowPassword(false);
      passwordRef.current?.focus();
    } finally {
      if (mounted.current) setLoading(false);
    }
  }

  const idInvalid = Boolean(touched.identifier && errors.identifier);
  const pwInvalid = Boolean(touched.password && errors.password);

  return (
    <main className="al-page">
      <aside className="al-brand" aria-hidden="false">
        <div className="al-brand-inner">
          <span className="al-mark"><ShieldIcon /></span>
          <h2 className="al-brand-title">Every payment checked before it’s trusted.</h2>
          <p className="al-brand-copy">
            Review onboarding requests, confirm payments and keep a clear record of who approved what.
          </p>
          <p className="al-brand-foot">Authorised administrators only. Access is monitored.</p>
        </div>
      </aside>

      <section className="al-panel">
        <div className="al-card">
          <header className="al-header">
            <span className="al-mark al-mark-small"><ShieldIcon /></span>
            <h1 className="al-title">{title}</h1>
            <p className="al-subtitle">{subtitle}</p>
          </header>

          {formError && (
            <div className="al-alert" role="alert" id={ids.formErr}>
              <span className="al-alert-dot" aria-hidden="true" />
              <span>{formError}</span>
            </div>
          )}

          <form className="al-form" onSubmit={handleSubmit} noValidate aria-busy={loading}>
            {identifierMode !== 'none' && (
              <div className="al-field">
                <label htmlFor={ids.identifier}>{identifierLabel}</label>
                <input
                  ref={identifierRef}
                  id={ids.identifier}
                  name="identifier"
                  type="text"
                  inputMode={identifierMode === 'email' ? 'email' : 'text'}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={values.identifier}
                  disabled={loading}
                  aria-invalid={idInvalid}
                  aria-describedby={idInvalid ? ids.idErr : undefined}
                  onChange={(e) => update('identifier', e.target.value)}
                  onBlur={() => blur('identifier')}
                />
                {idInvalid && <p className="al-error" id={ids.idErr}>{errors.identifier}</p>}
              </div>
            )}

            <div className="al-field">
              <div className="al-label-row">
                <label htmlFor={ids.password}>Password</label>
                {forgotPasswordHref !== null && (
                  <a className="al-link" href={forgotPasswordHref} onClick={onForgotPassword}>
                    Forgot password?
                  </a>
                )}
              </div>
              <div className="al-input-wrap">
                <input
                  ref={passwordRef}
                  id={ids.password}
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={values.password}
                  disabled={loading}
                  aria-invalid={pwInvalid}
                  aria-describedby={pwInvalid ? ids.pwErr : undefined}
                  onChange={(e) => update('password', e.target.value)}
                  onBlur={() => blur('password')}
                />
                <button
                  type="button"
                  className="al-toggle"
                  onClick={() => setShowPassword((s) => !s)}
                  disabled={loading}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
              {pwInvalid && <p className="al-error" id={ids.pwErr}>{errors.password}</p>}
            </div>

            {showRememberMe && (
              <label className="al-check">
                <input
                  type="checkbox"
                  checked={values.remember}
                  disabled={loading}
                  onChange={(e) => update('remember', e.target.checked)}
                />
                <span>Keep me signed in on this device</span>
              </label>
            )}

            <button type="submit" className="al-submit" disabled={loading}>
              {loading && <span className="al-spinner" aria-hidden="true" />}
              <span>{loading ? 'Signing in…' : 'Sign in'}</span>
            </button>
          </form>

          <OAuthProviders providers={oauthProviders} />
        </div>
      </section>
    </main>
  );
}
