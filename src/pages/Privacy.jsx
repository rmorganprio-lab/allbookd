import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

function Logo() {
  return (
    <div className="inline-flex items-center justify-center mb-3" style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1, color: '#1c1917' }}>
      <span>Timely</span>
      <svg style={{ width: '24px', height: '24px', color: '#047857', margin: '0 0.5px', position: 'relative', top: '-0.5px' }} viewBox="0 0 64 64" fill="none" stroke="currentColor">
        <circle cx="32" cy="32" r="28" strokeWidth="5.5" fill="none"/>
        <line x1="32" y1="32" x2="24" y2="17" strokeWidth="5.5" strokeLinecap="round"/>
        <line x1="32" y1="32" x2="44" y2="23" strokeWidth="4" strokeLinecap="round"/>
        <circle cx="32" cy="32" r="3" fill="currentColor" stroke="none"/>
      </svg>
      <span style={{ fontWeight: 500, color: '#047857' }}>ps</span>
    </div>
  )
}

export default function Privacy() {
  const { t } = useTranslation()
  return (
    <div className="min-h-screen bg-stone-50 px-4 py-12">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="text-center mb-10">
          <Link to="/" className="inline-block mb-4">
            <Logo />
          </Link>
          <h1 className="text-3xl font-bold text-stone-900 mb-2">{t('privacy.title')}</h1>
          <p className="text-sm text-stone-400">Last updated: March 26, 2026</p>
        </div>

        {/* Content card */}
        <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-8 md:p-12">

          <p className="text-stone-600 leading-relaxed mb-4">
            This Privacy Policy describes how TimelyOps ("we," "us," or "our") collects, uses, stores, and protects your personal data when you use the TimelyOps platform, website (timelyops.com), and related services (the "Service").
          </p>
          <p className="text-stone-600 leading-relaxed mb-4">
            TimelyOps is operated from the Netherlands and is committed to protecting your privacy in accordance with the General Data Protection Regulation (GDPR) and other applicable data protection laws.
          </p>
          <p className="text-stone-600 leading-relaxed mb-8">
            By using the Service, you acknowledge that you have read and understood this Privacy Policy.
          </p>

          {/* 1 */}
          <h2 className="text-xl font-bold text-stone-900 mt-8 mb-3">1. Data Controller</h2>
          <p className="text-stone-600 leading-relaxed mb-4">
            TimelyOps acts as the data controller for personal data collected through the Service. For questions about data processing, contact us at{' '}
            <a href="mailto:info@timelyops.com" className="text-emerald-700 hover:underline">info@timelyops.com</a>.
          </p>
          <p className="text-stone-600 leading-relaxed mb-4">
            When you use TimelyOps to manage your business, you act as the data controller for your end clients' personal data, and TimelyOps acts as the data processor on your behalf.
          </p>

          {/* 2 */}
          <h2 className="text-xl font-bold text-stone-900 mt-8 mb-3">2. Data We Collect</h2>

          <h3 className="text-base font-semibold text-stone-800 mt-4 mb-2">2.1 Account Data</h3>
          <p className="text-stone-600 leading-relaxed mb-3">When you register for the Service, we collect:</p>
          <ul className="list-disc pl-6 text-stone-600 leading-relaxed mb-4 space-y-1">
            <li>Full name</li>
            <li>Email address</li>
            <li>Phone number (if SMS authentication is used)</li>
            <li>Organization/business name</li>
            <li>Role within the organization (owner, manager, worker)</li>
          </ul>

          <h3 className="text-base font-semibold text-stone-800 mt-4 mb-2">2.2 Business Data</h3>
          <p className="text-stone-600 leading-relaxed mb-3">Through your use of the Service, you may enter:</p>
          <ul className="list-disc pl-6 text-stone-600 leading-relaxed mb-4 space-y-1">
            <li>Client names, addresses, phone numbers, and email addresses</li>
            <li>Worker names and contact information</li>
            <li>Scheduling and appointment data</li>
            <li>Quotes, invoices, and pricing information</li>
            <li>Payment records and transaction history</li>
            <li>Notes and communications related to jobs</li>
            <li>Property details (bedrooms, bathrooms, access codes, pet information)</li>
          </ul>

          <h3 className="text-base font-semibold text-stone-800 mt-4 mb-2">2.3 AI Agent Conversation Data</h3>
          <p className="text-stone-600 leading-relaxed mb-3">
            When your end clients interact with the AI Agent (via the web booking form or SMS), we collect and store:
          </p>
          <ul className="list-disc pl-6 text-stone-600 leading-relaxed mb-4 space-y-1">
            <li>The end client's phone number and name (as provided during the conversation)</li>
            <li>The full text of the conversation between the end client and the AI Agent</li>
            <li>Property details and service preferences shared during the conversation</li>
            <li>Booking requests and scheduling preferences</li>
          </ul>
          <p className="text-stone-600 leading-relaxed mb-4">
            This data is stored in our database, associated with your organization, and is accessible to you as the business owner. AI Agent conversations are processed by Anthropic (Claude API) to generate responses. Anthropic's data handling is governed by their API terms, which do not use API inputs for model training.
          </p>

          <h3 className="text-base font-semibold text-stone-800 mt-4 mb-2">2.4 Communication Data</h3>
          <p className="text-stone-600 leading-relaxed mb-3">
            When the Service sends emails or SMS messages on your behalf, we log:
          </p>
          <ul className="list-disc pl-6 text-stone-600 leading-relaxed mb-4 space-y-1">
            <li>Recipient email address or phone number</li>
            <li>Message type (quote, invoice, receipt, booking confirmation)</li>
            <li>Delivery status</li>
            <li>Timestamp of sending</li>
          </ul>
          <p className="text-stone-600 leading-relaxed mb-4">
            We do not store the full content of sent emails or SMS messages in our logs beyond what is necessary for delivery tracking and troubleshooting.
          </p>

          <h3 className="text-base font-semibold text-stone-800 mt-4 mb-2">2.5 Technical Data</h3>
          <p className="text-stone-600 leading-relaxed mb-3">We automatically collect:</p>
          <ul className="list-disc pl-6 text-stone-600 leading-relaxed mb-4 space-y-1">
            <li>IP address and approximate location</li>
            <li>Browser type and version</li>
            <li>Device type and operating system</li>
            <li>Pages visited and features used within the Service</li>
            <li>Date and time of access</li>
            <li>Authentication logs (login times, methods used)</li>
          </ul>

          <h3 className="text-base font-semibold text-stone-800 mt-4 mb-2">2.6 Data We Do Not Collect</h3>
          <p className="text-stone-600 leading-relaxed mb-4">
            We do not knowingly collect sensitive personal data such as racial or ethnic origin, political opinions, religious beliefs, health data, or biometric data. We do not collect data from children under 18.
          </p>

          {/* 3 */}
          <h2 className="text-xl font-bold text-stone-900 mt-8 mb-3">3. How We Use Your Data</h2>
          <p className="text-stone-600 leading-relaxed mb-3">We use your data for the following purposes:</p>
          <ul className="list-disc pl-6 text-stone-600 leading-relaxed mb-4 space-y-2">
            <li><strong>Service delivery:</strong> To operate, maintain, and provide the features of the Service, including scheduling, invoicing, payments, communications, and AI-powered booking</li>
            <li><strong>Authentication:</strong> To verify your identity via email OTP or SMS verification</li>
            <li><strong>Communication:</strong> To send you service-related notifications, security alerts, and support messages</li>
            <li><strong>AI Agent operation:</strong> To process conversations between your end clients and the AI Agent, including generating responses, looking up pricing, checking availability, and creating draft bookings</li>
            <li><strong>Transactional communications:</strong> To send emails and SMS messages to your end clients on your behalf (quotes, invoices, receipts, booking confirmations)</li>
            <li><strong>Improvement:</strong> To analyze usage patterns, fix bugs, and improve the Service</li>
            <li><strong>Legal compliance:</strong> To comply with applicable laws, regulations, and legal processes</li>
            <li><strong>Security:</strong> To detect, prevent, and respond to fraud, abuse, or security incidents</li>
          </ul>

          {/* 4 */}
          <h2 className="text-xl font-bold text-stone-900 mt-8 mb-3">4. Legal Basis for Processing (GDPR)</h2>
          <p className="text-stone-600 leading-relaxed mb-3">
            Under the GDPR, we process your personal data based on the following legal grounds:
          </p>
          <ul className="list-disc pl-6 text-stone-600 leading-relaxed mb-4 space-y-2">
            <li><strong>Contract performance:</strong> Processing necessary to provide the Service you have signed up for (Article 6(1)(b))</li>
            <li><strong>Legitimate interests:</strong> Processing for our legitimate business interests, such as improving the Service, ensuring security, and preventing abuse, where these interests are not overridden by your rights (Article 6(1)(f))</li>
            <li><strong>Legal obligation:</strong> Processing required to comply with applicable laws (Article 6(1)(c))</li>
            <li><strong>Consent:</strong> Where required, we will obtain your consent before processing (Article 6(1)(a)). You may withdraw consent at any time.</li>
          </ul>

          {/* 5 */}
          <h2 className="text-xl font-bold text-stone-900 mt-8 mb-3">5. Automated Decision-Making and AI Processing</h2>
          <p className="text-stone-600 leading-relaxed mb-4">
            The Service uses artificial intelligence (currently Anthropic Claude) to power the AI Agent. The AI Agent engages in automated processing that includes:
          </p>
          <ul className="list-disc pl-6 text-stone-600 leading-relaxed mb-4 space-y-1">
            <li>Generating price quotes based on your pricing matrix and the property details provided by your end client</li>
            <li>Checking your schedule for available time slots</li>
            <li>Creating draft booking requests for your review</li>
          </ul>
          <p className="text-stone-600 leading-relaxed mb-4">
            No booking is finalized automatically. All AI Agent-created bookings require explicit confirmation by you (the business owner) before they become active. The AI Agent does not make binding business decisions on your behalf without your approval.
          </p>
          <p className="text-stone-600 leading-relaxed mb-4">
            Under GDPR Article 22, you and your end clients have the right not to be subject to decisions based solely on automated processing that produce legal or similarly significant effects. Since all bookings require human confirmation, the AI Agent's processing does not constitute solely automated decision-making under Article 22.
          </p>

          {/* 6 */}
          <h2 className="text-xl font-bold text-stone-900 mt-8 mb-3">6. Data Sharing and Third Parties</h2>
          <p className="text-stone-600 leading-relaxed mb-3">
            We do not sell your personal data. We share data only with the following categories of third parties, and only to the extent necessary to provide the Service:
          </p>
          <ul className="list-disc pl-6 text-stone-600 leading-relaxed mb-4 space-y-2">
            <li><strong>Supabase (database hosting):</strong> Stores your account and business data. Supabase servers may be located in the United States.</li>
            <li><strong>Vercel (web hosting):</strong> Hosts the TimelyOps web application. Vercel servers may be located in the United States and other regions.</li>
            <li><strong>Twilio (SMS and phone):</strong> Processes phone numbers for SMS-based authentication, SMS delivery, and AI Agent phone interactions. Twilio servers may be located in the United States.</li>
            <li><strong>Resend (email delivery):</strong> Processes email addresses for transactional email delivery (quotes, invoices, receipts, notifications). Resend servers may be located in the United States.</li>
            <li><strong>Anthropic (AI processing):</strong> Processes AI Agent conversation text to generate responses. Anthropic servers are located in the United States. Anthropic's API terms state that API inputs are not used for model training.</li>
          </ul>
          <p className="text-stone-600 leading-relaxed mb-4">
            We may also disclose data if required by law, court order, or to protect the rights, safety, or property of TimelyOps, our users, or the public.
          </p>

          {/* 7 */}
          <h2 className="text-xl font-bold text-stone-900 mt-8 mb-3">7. International Data Transfers</h2>
          <p className="text-stone-600 leading-relaxed mb-3">
            Some of our third-party service providers are based outside the European Economic Area (EEA), primarily in the United States. When personal data is transferred outside the EEA, we ensure appropriate safeguards are in place, such as:
          </p>
          <ul className="list-disc pl-6 text-stone-600 leading-relaxed mb-4 space-y-1">
            <li>Standard Contractual Clauses (SCCs) approved by the European Commission</li>
            <li>Adequacy decisions by the European Commission</li>
            <li>The EU-U.S. Data Privacy Framework, where applicable</li>
          </ul>

          {/* 8 */}
          <h2 className="text-xl font-bold text-stone-900 mt-8 mb-3">8. Data Retention</h2>
          <p className="text-stone-600 leading-relaxed mb-3">
            We retain your data for as long as your account is active or as needed to provide the Service. Specifically:
          </p>
          <ul className="list-disc pl-6 text-stone-600 leading-relaxed mb-4 space-y-2">
            <li><strong>Account data:</strong> Retained while your account is active and for 30 days after account deletion to allow for data export.</li>
            <li><strong>Business data:</strong> Retained while your account is active. Deleted within 90 days of account termination (after the 30-day export window).</li>
            <li><strong>AI Agent conversations:</strong> Retained while your account is active. Conversation data older than 12 months may be archived or summarized.</li>
            <li><strong>Communication logs:</strong> Retained for up to 12 months for delivery tracking and troubleshooting.</li>
            <li><strong>Technical logs:</strong> Retained for up to 12 months for security and debugging purposes.</li>
            <li><strong>Billing records:</strong> Retained as required by tax and accounting laws (typically 7 years).</li>
          </ul>

          {/* 9 */}
          <h2 className="text-xl font-bold text-stone-900 mt-8 mb-3">9. Your Rights</h2>
          <p className="text-stone-600 leading-relaxed mb-3">
            Under the GDPR and applicable data protection laws, you have the following rights:
          </p>
          <ul className="list-disc pl-6 text-stone-600 leading-relaxed mb-4 space-y-2">
            <li><strong>Access:</strong> Request a copy of the personal data we hold about you.</li>
            <li><strong>Rectification:</strong> Request correction of inaccurate or incomplete data.</li>
            <li><strong>Erasure:</strong> Request deletion of your personal data ("right to be forgotten"), subject to legal retention requirements.</li>
            <li><strong>Data portability:</strong> Request your data in a structured, machine-readable format. The Service provides CSV and Excel export functionality for this purpose.</li>
            <li><strong>Restriction:</strong> Request that we restrict processing of your data in certain circumstances.</li>
            <li><strong>Objection:</strong> Object to processing based on legitimate interests.</li>
            <li><strong>Withdraw consent:</strong> Where processing is based on consent, withdraw it at any time without affecting prior processing.</li>
            <li><strong>Automated processing:</strong> Object to decisions made solely by automated processing, including the AI Agent, where they have legal or significant effects.</li>
          </ul>
          <p className="text-stone-600 leading-relaxed mb-4">
            To exercise any of these rights, contact us at{' '}
            <a href="mailto:info@timelyops.com" className="text-emerald-700 hover:underline">info@timelyops.com</a>. We will respond within 30 days.
          </p>
          <p className="text-stone-600 leading-relaxed mb-4">
            You also have the right to lodge a complaint with a supervisory authority. In the Netherlands, this is the Autoriteit Persoonsgegevens (Dutch Data Protection Authority) at autoriteitpersoonsgegevens.nl.
          </p>

          {/* 10 */}
          <h2 className="text-xl font-bold text-stone-900 mt-8 mb-3">10. Data Security</h2>
          <p className="text-stone-600 leading-relaxed mb-3">
            We implement appropriate technical and organizational measures to protect your data, including:
          </p>
          <ul className="list-disc pl-6 text-stone-600 leading-relaxed mb-4 space-y-1">
            <li>Encryption in transit (TLS/HTTPS) and at rest</li>
            <li>Row-level security policies ensuring data isolation between organizations</li>
            <li>Role-based access controls (owner, manager, worker roles with different permission levels)</li>
            <li>One-time passcode authentication (no stored passwords)</li>
            <li>Input validation and sanitization on all forms and API endpoints</li>
            <li>Rate limiting on email, SMS, and AI Agent interactions to prevent abuse</li>
            <li>HTML escaping in all dynamically generated content to prevent cross-site scripting</li>
            <li>Regular security reviews and monitoring</li>
          </ul>
          <p className="text-stone-600 leading-relaxed mb-4">
            No system is completely secure. While we take reasonable precautions, we cannot guarantee absolute security of your data.
          </p>

          {/* 11 */}
          <h2 className="text-xl font-bold text-stone-900 mt-8 mb-3">11. Cookies and Local Storage</h2>
          <p className="text-stone-600 leading-relaxed mb-4">
            The Service uses essential cookies and browser local storage for authentication and session management. These are strictly necessary for the Service to function and do not require consent under the ePrivacy Directive.
          </p>
          <p className="text-stone-600 leading-relaxed mb-3">Specifically, we use:</p>
          <ul className="list-disc pl-6 text-stone-600 leading-relaxed mb-4 space-y-1">
            <li>Session tokens stored in local storage for maintaining your login session</li>
            <li>Authentication state cookies for secure session management</li>
          </ul>
          <p className="text-stone-600 leading-relaxed mb-4">
            We do not use advertising cookies, tracking pixels, or third-party analytics cookies. We do not engage in cross-site tracking.
          </p>

          {/* 12 */}
          <h2 className="text-xl font-bold text-stone-900 mt-8 mb-3">12. Children's Privacy</h2>
          <p className="text-stone-600 leading-relaxed mb-4">
            The Service is intended for business use by individuals aged 18 and older. We do not knowingly collect personal data from children under 18. If we become aware that we have collected data from a child, we will delete it promptly.
          </p>

          {/* 13 */}
          <h2 className="text-xl font-bold text-stone-900 mt-8 mb-3">13. Your Responsibilities as a Data Controller</h2>
          <p className="text-stone-600 leading-relaxed mb-3">
            When you use TimelyOps to manage your clients' data, you are the data controller for that data under the GDPR. This means you are responsible for:
          </p>
          <ul className="list-disc pl-6 text-stone-600 leading-relaxed mb-4 space-y-1">
            <li>Having a lawful basis to collect and process your clients' personal data</li>
            <li>Informing your clients about how their data is used, including that it is stored using the TimelyOps platform and that an AI-powered agent may communicate with them</li>
            <li>Obtaining appropriate consent from your clients before sending them communications (emails, SMS) through the Service</li>
            <li>Responding to data access or deletion requests from your clients</li>
            <li>Ensuring the accuracy of client data you enter into the Service</li>
          </ul>
          <p className="text-stone-600 leading-relaxed mb-4">
            We will assist you in fulfilling your obligations as a data controller to the extent required by applicable law.
          </p>

          {/* 14 */}
          <h2 className="text-xl font-bold text-stone-900 mt-8 mb-3">14. Changes to This Privacy Policy</h2>
          <p className="text-stone-600 leading-relaxed mb-4">
            We may update this Privacy Policy from time to time. We will notify you of material changes by email or through the Service at least 30 days before they take effect.
          </p>
          <p className="text-stone-600 leading-relaxed mb-4">
            The "Effective Date" at the top of this policy indicates when it was last updated.
          </p>

          {/* 15 */}
          <h2 className="text-xl font-bold text-stone-900 mt-8 mb-3">15. Contact Information</h2>
          <p className="text-stone-600 leading-relaxed mb-3">
            For questions, concerns, or requests related to this Privacy Policy or your personal data, contact us:
          </p>
          <ul className="list-none text-stone-600 leading-relaxed mb-4 space-y-1">
            <li><strong>Email:</strong> <a href="mailto:info@timelyops.com" className="text-emerald-700 hover:underline">info@timelyops.com</a></li>
            <li><strong>Website:</strong> <a href="https://timelyops.com" className="text-emerald-700 hover:underline">timelyops.com</a></li>
            <li><strong>Location:</strong> The Netherlands</li>
          </ul>

          {/* Cross-link */}
          <div className="mt-10 pt-6 border-t border-stone-100 text-sm text-stone-400">
            See also:{' '}
            <Link to="/terms" className="text-emerald-700 hover:underline">Terms of Service</Link>
          </div>
        </div>

        <p className="text-center mt-6 text-xs text-stone-400">
          <Link to="/login" className="hover:text-stone-600">Sign in to TimelyOps</Link>
        </p>
      </div>
    </div>
  )
}
