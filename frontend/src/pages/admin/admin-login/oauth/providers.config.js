import { GoogleIcon /*, MicrosoftIcon, GitHubIcon */ } from './ProviderIcons.jsx';

/**
 * OAuth provider registry. This is the ONLY place you edit to add a provider.
 *
 * Fields
 *   id           unique key
 *   label        text shown on the button ("Google")
 *   Icon         React component rendering the icon
 *   status       'enabled'      -> clickable, ONLY if href or onClick is also set
 *                'coming-soon'  -> disabled, badge "Coming soon"
 *                'disabled'     -> disabled, badge "Not configured"
 *   href         URL of YOUR backend route that starts the flow, e.g. "/api/auth/oauth/google/start".
 *                Rendered as a normal link, so the browser does a full-page redirect and the
 *                server performs the authorization-code flow. No tokens ever touch the frontend.
 *   onClick      optional alternative to href (e.g. to call analytics before navigating)
 *   statusLabel  optional override for the badge text
 *
 * Safety rule enforced by <OAuthProviders>: a provider is clickable only when
 * status === 'enabled' AND it has an href or onClick. Anything else renders disabled.
 */

export const oauthProviders = [
  {
    id: 'google',
    label: 'Google',
    Icon: GoogleIcon,
    status: 'coming-soon',
  },

  // Example of adding another provider later (uncomment the import above too):
  // {
  //   id: 'microsoft',
  //   label: 'Microsoft',
  //   Icon: MicrosoftIcon,
  //   status: 'coming-soon',
  //   // href: '/api/auth/oauth/microsoft/start',
  // },
  // {
  //   id: 'github',
  //   label: 'GitHub',
  //   Icon: GitHubIcon,
  //   status: 'coming-soon',
  // },
];
