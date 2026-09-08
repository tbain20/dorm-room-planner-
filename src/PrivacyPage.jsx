import { Link } from 'react-router-dom'
import LegalPageLayout from './LegalPageLayout.jsx'

export default function PrivacyPage() {
  return (
    <LegalPageLayout title="Privacy Policy" updated="9/8/26">
      <p>
        This Privacy Policy explains what information Dorm Room Planner ("we," "us," "our")
        collects, how we use it, and your choices regarding that information.
      </p>

      <h2>1. Information We Collect</h2>
      <p><strong>Information you provide directly:</strong></p>
      <ul>
        <li>Email address and password (for account creation, via our authentication provider)</li>
        <li>Optional profile information: bio, dorm hall, class year, display name</li>
        <li>Room layouts you create: dimensions, furniture placement, item selections</li>
        <li>Content you upload: custom item names/links, custom poster images</li>
        <li>Comments, likes, follows, and other community activity</li>
        <li>Any information you send us directly (e.g. via a feedback form or email)</li>
      </ul>
      <p><strong>Information collected automatically:</strong></p>
      <ul>
        <li>
          Basic usage analytics (pages visited, general interaction patterns) via Vercel Analytics
          — this is aggregated/anonymized usage data, not tied to your identity beyond what's
          needed to understand how the Service is used
        </li>
        <li>Standard technical data (browser type, device type) collected automatically by our hosting infrastructure</li>
      </ul>

      <h2>2. How We Use Your Information</h2>
      <p>We use collected information to:</p>
      <ul>
        <li>Provide and operate the Service (create your account, save your layouts, show you personalized content)</li>
        <li>Enable community features (Browse, likes, comments, following)</li>
        <li>Improve the Service based on usage patterns</li>
        <li>Communicate with you about your account if necessary</li>
        <li>Comply with legal obligations</li>
      </ul>
      <p>We do not sell your personal information.</p>

      <h2>3. How Information Is Shared</h2>
      <p>
        <strong>Service providers:</strong> we use Supabase (database, authentication, and file
        storage) and Vercel (hosting, analytics) to operate the Service. These providers process
        data on our behalf and are bound by their own privacy/security practices.
      </p>
      <p>
        <strong>Public content:</strong> if you make a layout, profile, or other content public,
        that content (and associated public profile information you've chosen to share) is visible
        to anyone using the Service, including people not signed in.
      </p>
      <p>
        <strong>Third-party retailers:</strong> when you click a product link, you leave our
        Service and are subject to that retailer's own privacy practices. We do not share your
        personal information with retailers as part of this — the link click itself doesn't
        transmit your account data to them.
      </p>
      <p>
        We may disclose information if required by law, or to protect the rights, safety, or
        property of us, our users, or others.
      </p>

      <h2>4. Your Choices</h2>
      <ul>
        <li>You can update or delete your profile information at any time through your account settings.</li>
        <li>You can make your layouts private or delete them at any time.</li>
        <li>
          You can delete your account, which will remove your personal information consistent with
          our data retention practices (public content you created may be handled per our User
          Content terms in the <Link to="/terms">Terms of Service</Link>).
        </li>
        <li>You can opt out of non-essential communications from us.</li>
      </ul>

      <h2>5. Data Security</h2>
      <p>
        We use reasonable technical and organizational measures to protect your information (e.g.
        industry-standard authentication and database security practices via our infrastructure
        providers). No system is completely secure, and we can't guarantee absolute security.
      </p>

      <h2>6. Children's Privacy</h2>
      <p>
        The Service is not directed at children under 13, and we do not knowingly collect
        information from children under 13.
      </p>

      <h2>7. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. We'll update the "Last updated" date
        above when we do.
      </p>

      <h2>8. Contact</h2>
      <p>
        Questions about this Privacy Policy? Contact us at{' '}
        <a href="mailto:tylerabain@icloud.com">tylerabain@icloud.com</a>.
      </p>
    </LegalPageLayout>
  )
}
