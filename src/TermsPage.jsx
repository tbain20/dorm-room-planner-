import { Link } from 'react-router-dom'
import LegalPageLayout from './LegalPageLayout.jsx'

export default function TermsPage() {
  return (
    <LegalPageLayout title="Terms of Service" updated="9/8/26">
      <p>
        Welcome to Dorm Room Planner (the "Service"), operated by Tyler Bain ("we," "us," "our").
        By creating an account or using the Service, you agree to these Terms of Service ("Terms").
        If you don't agree, please don't use the Service.
      </p>

      <h2>1. What the Service Is</h2>
      <p>
        Dorm Room Planner lets users create 3D dorm room layouts, browse and copy layouts created
        by other users, add furniture and decor items to a shopping list, and access links to
        third-party retailers to purchase those items. Some furniture measurements are based on
        publicly available information (e.g. university-provided residence hall furniture
        specifications) and are provided for planning purposes only.
      </p>

      <h2>2. Accounts</h2>
      <ul>
        <li>You must provide accurate information when creating an account.</li>
        <li>You're responsible for keeping your login credentials secure and for all activity under your account.</li>
        <li>You must be at least 13 years old to use the Service.</li>
      </ul>

      <h2>3. User Content</h2>
      <p>
        You retain ownership of any room layouts, custom item entries, uploaded images (e.g.
        custom posters), comments, or other content you create or upload ("User Content").
      </p>
      <p>
        By posting User Content publicly (e.g. making a layout public), you grant us a
        non-exclusive, worldwide, royalty-free license to display, distribute, and use that content
        within the Service, including in features like Browse, shared links, and thumbnails.
      </p>
      <p>
        You're responsible for your own User Content. Don't upload anything you don't have the
        right to use, or anything illegal, infringing, harassing, or otherwise inappropriate.
      </p>
      <p>
        We reserve the right to remove any User Content, or suspend/terminate accounts, at our
        discretion — including in response to user reports.
      </p>

      <h2>4. Third-Party Links and Purchases</h2>
      <p>
        The Service contains links to third-party retailers (e.g. Amazon). We are not responsible
        for the products, pricing, availability, or business practices of these third-party sites.
      </p>
      <p>
        Some links may be affiliate links, meaning we may earn a commission on qualifying purchases
        made through them, at no additional cost to you.
      </p>
      <p>
        Any purchase you make through a linked retailer is a transaction between you and that
        retailer, not with us. We make no guarantees about product quality, fit, or accuracy of any
        measurements provided.
      </p>

      <h2>5. Furniture and Room Data Accuracy</h2>
      <p>
        Room dimensions, furniture measurements, and 3D visualizations are provided for general
        planning purposes only. We make reasonable efforts to keep this information accurate but do
        not guarantee it. Always verify critical measurements yourself before making purchasing
        decisions.
      </p>

      <h2>6. Prohibited Conduct</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Post content that is illegal, infringing, harassing, or intended to harm others</li>
        <li>Attempt to access other users' accounts or data without authorization</li>
        <li>Use the Service to spam, scrape, or abuse other users</li>
        <li>Interfere with the operation or security of the Service</li>
      </ul>

      <h2>7. Termination</h2>
      <p>
        We may suspend or terminate your account at any time for violation of these Terms or for
        any other reason at our discretion. You may delete your account at any time.
      </p>

      <h2>8. Disclaimer of Warranties</h2>
      <p>
        The Service is provided "as is" without warranties of any kind, express or implied. We do
        not guarantee the Service will be uninterrupted, error-free, or secure.
      </p>

      <h2>9. Limitation of Liability</h2>
      <p>
        To the fullest extent permitted by law, Tyler Bain is not liable for any indirect,
        incidental, or consequential damages arising from your use of the Service, including but
        not limited to purchases made through third-party links.
      </p>

      <h2>10. Changes to These Terms</h2>
      <p>
        We may update these Terms from time to time. Continued use of the Service after changes
        take effect constitutes acceptance of the updated Terms.
      </p>

      <h2>11. Governing Law</h2>
      <p>
        These Terms are governed by the laws of the State of New York, without regard to conflict
        of law principles.
      </p>

      <h2>12. Contact</h2>
      <p>
        Questions about these Terms? Contact us at{' '}
        <a href="mailto:tylerabain@icloud.com">tylerabain@icloud.com</a>. See also our{' '}
        <Link to="/privacy">Privacy Policy</Link>.
      </p>
    </LegalPageLayout>
  )
}
