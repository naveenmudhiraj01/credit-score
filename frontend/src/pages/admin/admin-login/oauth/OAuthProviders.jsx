import { oauthProviders as defaultProviders } from './providers.config.js';

export function isProviderUsable(p) {
  return p.status === 'enabled' && (Boolean(p.href) || typeof p.onClick === 'function');
}

function badgeText(p) {
  if (p.statusLabel) return p.statusLabel;
  return p.status === 'coming-soon' ? 'Coming soon' : 'Not configured';
}

/**
 * Renders the OAuth section from a provider list. Adding a provider never requires
 * touching this component or the login page; edit providers.config.js instead.
 */
export default function OAuthProviders({ providers = defaultProviders, heading = 'Or continue with' }) {
  if (!providers.length) return null;

  return (
    <section className="al-oauth" aria-label="Single sign-on options">
      <div className="al-divider" role="presentation">
        <span>{heading}</span>
      </div>

      <ul className="al-oauth-list">
        {providers.map((p) => {
          const usable = isProviderUsable(p);
          const { Icon } = p;
          const content = (
            <>
              <Icon className="al-oauth-icon" />
              <span className="al-oauth-label"><span className="al-oauth-prefix">Continue with </span>{p.label}</span>
              {!usable && <span className="al-badge">{badgeText(p)}</span>}
            </>
          );

          return (
            <li key={p.id}>
              {usable && p.href ? (
                <a className="al-oauth-btn" href={p.href} onClick={p.onClick}>
                  {content}
                </a>
              ) : usable ? (
                <button type="button" className="al-oauth-btn" onClick={p.onClick}>
                  {content}
                </button>
              ) : (
                <button
                  type="button"
                  className="al-oauth-btn"
                  disabled
                  aria-disabled="true"
                  title={`${p.label} sign-in is not available yet`}
                >
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {providers.every((p) => !isProviderUsable(p)) && (
        <p className="al-oauth-note">Single sign-on isn’t available yet. Use your admin password.</p>
      )}
    </section>
  );
}
