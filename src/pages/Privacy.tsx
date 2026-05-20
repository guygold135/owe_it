import { LegalDocumentLayout, LegalSection } from '@/components/LegalDocumentLayout';
import { LEGAL_CONTACT_EMAIL, LEGAL_ENTITY_NAME } from '@/lib/legal';

export default function Privacy() {
  return (
    <LegalDocumentLayout title="Privacy Policy">
      <LegalSection title="1. Introduction">
        <p>
          This Privacy Policy explains how {LEGAL_ENTITY_NAME} (&quot;Owe It,&quot; &quot;we,&quot;
          &quot;us,&quot; or &quot;our&quot;) collects, uses, shares, and protects personal data when you
          use our application and related services (the &quot;Service&quot;). We process personal data in
          accordance with applicable privacy laws, including the EU General Data Protection Regulation
          (GDPR) where it applies.
        </p>
      </LegalSection>

      <LegalSection title="2. Data controller">
        <p>
          For the purposes of the GDPR, Owe It is the data controller for personal data described in this
          policy. Contact:{' '}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
        </p>
      </LegalSection>

      <LegalSection title="3. Personal data we collect">
        <p>Depending on how you use the Service, we may collect:</p>
        <ul>
          <li>
            <strong>Account data:</strong> email address, display name, profile photo, authentication
            identifiers (including OAuth provider data if you sign in with Google).
          </li>
          <li>
            <strong>Goal and social data:</strong> goal titles, descriptions, deadlines, stakes,
            privacy settings, judge relationships, and activity visible to friends or judges.
          </li>
          <li>
            <strong>Payment data:</strong> payment method tokens, customer identifiers, transaction
            amounts, currencies, charge status, and related metadata. Full card numbers are processed by
            our payment partners and are not stored on our servers.
          </li>
          <li>
            <strong>Technical data:</strong> device type, app version, log data, and security-related
            events.
          </li>
          <li>
            <strong>Communications:</strong> messages you send to support or feedback you submit.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="4. How we use your data">
        <p>We use personal data to:</p>
        <ul>
          <li>provide, maintain, and improve the Service;</li>
          <li>authenticate you and secure your account;</li>
          <li>process vaulted payment methods and commitment-based charges;</li>
          <li>transfer net stake amounts to partner charities when goals fail;</li>
          <li>enable judging, reminders, and social features you choose;</li>
          <li>comply with law, prevent fraud, and enforce our Terms;</li>
          <li>respond to support requests and send service-related notices.</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Legal bases (GDPR)">
        <p>Where the GDPR applies, we rely on the following legal bases:</p>
        <ul>
          <li>
            <strong>Contract (Art. 6(1)(b)):</strong> to provide the Service, vault payment methods, and
            process charges you authorize when creating goals.
          </li>
          <li>
            <strong>Legitimate interests (Art. 6(1)(f)):</strong> to secure the Service, prevent abuse,
            improve features, and communicate about your account, balanced against your rights.
          </li>
          <li>
            <strong>Consent (Art. 6(1)(a)):</strong> where required, for optional features or marketing
            (you may withdraw consent at any time without affecting lawfulness of prior processing).
          </li>
          <li>
            <strong>Legal obligation (Art. 6(1)(c)):</strong> where we must retain or disclose data to
            comply with law.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="6. Payment processors">
        <p>
          Payment card data is collected and processed by Braintree (PayPal) and related card networks
          using industry-standard tokenization. We receive only tokens and limited metadata needed to
          charge your vaulted method when a goal fails. Braintree&apos;s privacy practices are described in
          PayPal&apos;s privacy notices applicable to Braintree services. Braintree handles sensitive card
          data under its own PCI DSS compliance program.
        </p>
      </LegalSection>

      <LegalSection title="7. Sharing and processors">
        <p>We share personal data only as needed with:</p>
        <ul>
          <li>
            <strong>Infrastructure providers</strong> (e.g., Supabase for database and authentication);
          </li>
          <li>
            <strong>Payment processors</strong> (Braintree);
          </li>
          <li>
            <strong>Charitable partners</strong> to the extent required to route donations (typically
            aggregated or transactional, not your full profile);
          </li>
          <li>
            <strong>Professional advisers</strong> and authorities when required by law.
          </li>
        </ul>
        <p>
          We do not sell your personal data. Processors act on our instructions under data processing
          agreements where required.
        </p>
      </LegalSection>

      <LegalSection title="8. International transfers">
        <p>
          Your data may be processed in countries outside your residence (including the United States
          and Israel). Where required, we implement appropriate safeguards such as Standard Contractual
          Clauses or equivalent mechanisms approved under GDPR.
        </p>
      </LegalSection>

      <LegalSection title="9. Retention">
        <p>
          We retain personal data for as long as your account is active and as needed to fulfill the
          purposes described in this policy, including legal, tax, and payment record-keeping. You may
          request deletion of your account in the app; some data may be retained in anonymized or
          backup form for a limited period where permitted by law.
        </p>
      </LegalSection>

      <LegalSection title="10. Your rights">
        <p>
          Depending on your location, you may have the right to access, rectify, erase, restrict, or
          port your personal data, and to object to certain processing. Where processing is based on
          consent, you may withdraw consent at any time.
        </p>
        <p>
          To exercise rights, email{' '}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>. We will respond within
          the timeframes required by applicable law (typically one month under GDPR). You may also lodge
          a complaint with your local supervisory authority.
        </p>
      </LegalSection>

      <LegalSection title="11. Security">
        <p>
          We use technical and organizational measures appropriate to the risk, including encryption in
          transit, access controls, and tokenized payments. No method of transmission or storage is 100%
          secure.
        </p>
      </LegalSection>

      <LegalSection title="12. Children">
        <p>
          The Service is not directed to children under 18. We do not knowingly collect personal data
          from children. Contact us if you believe we have collected such data.
        </p>
      </LegalSection>

      <LegalSection title="13. Cookies and similar technologies">
        <p>
          Our web app may use essential cookies or local storage for authentication and preferences. We
          do not use non-essential tracking cookies without consent where required by law.
        </p>
      </LegalSection>

      <LegalSection title="14. Changes">
        <p>
          We may update this Privacy Policy from time to time. We will post the revised version in the
          Service and update the effective date. Material changes may be communicated via the app or
          email where appropriate.
        </p>
      </LegalSection>

      <LegalSection title="15. Contact">
        <p>
          Privacy questions and requests:{' '}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
        </p>
      </LegalSection>
    </LegalDocumentLayout>
  );
}
