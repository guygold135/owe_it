import { LegalDocumentLayout, LegalSection } from '@/components/LegalDocumentLayout';
import { LEGAL_CONTACT_EMAIL, LEGAL_ENTITY_NAME, LEGAL_OPERATOR_NAME, LEGAL_WEBSITE } from '@/lib/legal';

export default function Terms() {
  return (
    <LegalDocumentLayout title="Terms of Service">
      <LegalSection title="1. Agreement to these Terms">
        <p>
          These Terms of Service (&quot;Terms&quot;) govern your access to and use of the {LEGAL_ENTITY_NAME}{' '}
          mobile and web application, website at{' '}
          <a href={LEGAL_WEBSITE} rel="noopener noreferrer">
            {LEGAL_WEBSITE.replace(/^https?:\/\//, '')}
          </a>
          , and related services (collectively, the &quot;Service&quot;). By creating an account, setting a
          goal, or saving a payment method, you agree to these Terms. If you do not agree, do not use
          the Service.
        </p>
      </LegalSection>

      <LegalSection title="2. Who we are">
        <p>
          The Service is operated by {LEGAL_OPERATOR_NAME} (&quot;Owe It,&quot; &quot;we,&quot; &quot;us,&quot; or
          &quot;our&quot;). For questions about these Terms, contact us at{' '}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
        </p>
      </LegalSection>

      <LegalSection title="3. Eligibility">
        <p>
          You must be at least 18 years old (or the age of majority in your jurisdiction) and able to
          form a binding contract to use the Service. You represent that the payment method you provide
          belongs to you and that you are authorized to use it.
        </p>
      </LegalSection>

      <LegalSection title="4. The Service">
        <p>
          Owe It is an accountability platform. You may create personal goals, optionally invite judges,
          and attach a monetary stake. Stakes are intended as a commitment device: if you do not meet
          your self-imposed goal by the deadline you set, a charge may be processed and transferred to
          partner charities, subject to these Terms and applicable law.
        </p>
        <p>
          We do not guarantee that any goal will be achieved. Judges, where used, provide a good-faith
          assessment based on the criteria you define; their decisions affect whether a stake is charged
          when a goal ends.
        </p>
      </LegalSection>

      <LegalSection
        id="commitment-charging"
        title="5. Commitment-based charging (delayed capture and vaulting)"
      >
        <p>
          <strong>Authorization when you set a goal.</strong> When you create a goal with a monetary
          stake, you expressly authorize Owe It and our payment processors (including Braintree and
          affiliated card networks) to:
        </p>
        <ul>
          <li>
            securely tokenize and vault your payment credentials (for example, card details provided
            through our hosted payment fields);
          </li>
          <li>
            store those credentials for the purpose of processing a future transaction related to that
            goal; and
          </li>
          <li>
            charge your vaulted payment method only if you fail to meet your self-imposed goal before the
            deadline you selected (or as otherwise determined when the goal is resolved, including by a
            judge where applicable).
          </li>
        </ul>
        <p>
          <strong>No charge at vaulting.</strong> Saving your payment method does not, by itself, debit
          your account. We use delayed capture: the penalty amount you selected is charged only after
          your goal is finalized as not completed (or otherwise subject to a failed commitment under the
          rules of the Service).
        </p>
        <p>
          <strong>Amount and timing.</strong> The charge will not exceed the stake amount and currency
          you confirmed when creating the goal, plus any disclosed processing or platform fees. You will
          be notified in the app when a charge is attempted or completed, where technically feasible.
        </p>
        <p>
          <strong>Your responsibility.</strong> You must keep your vaulted payment method valid and
          sufficiently funded. If a charge fails, we may retry in accordance with our policies and
          payment network rules, and you remain responsible for fulfilling your commitment.
        </p>
        <p>
          <strong>Withdrawal of consent.</strong> You may remove or replace a saved payment method in
          account settings where available, but doing so does not cancel charges already authorized for
          active goals with pending or due stakes.
        </p>
      </LegalSection>

      <LegalSection title="6. Charitable transfers and refunds">
        <p>
          When a stake charge is successfully processed after a failed commitment, the net amount (after
          payment processing and any disclosed platform fees) is transferred to partner charities or
          charitable pools you selected or that apply by default in the Service.
        </p>
        <p>
          <strong>All finalized stake charges are non-refundable.</strong> Because funds are directed to
          charitable purposes upon successful capture, we do not offer refunds, chargebacks through Owe
          It, or credits for completed charitable transfers except where required by mandatory law or
          expressly stated in writing by us.
        </p>
        <p>
          Disputes with your card issuer remain between you and your issuer; however, initiating a
          chargeback after a completed charitable transfer may result in suspension of your account.
        </p>
      </LegalSection>

      <LegalSection title="7. Fees and taxes">
        <p>
          We may deduct payment processing fees and a platform fee from the stake before charitable
          transfer, as disclosed in the app at the time you confirm your goal. You are responsible for
          any taxes associated with your use of the Service, to the extent applicable in your
          jurisdiction.
        </p>
      </LegalSection>

      <LegalSection title="8. Account security">
        <p>
          You are responsible for safeguarding your login credentials and for all activity under your
          account. Notify us promptly at{' '}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a> if you suspect unauthorized
          access.
        </p>
      </LegalSection>

      <LegalSection title="9. Acceptable use">
        <p>You agree not to:</p>
        <ul>
          <li>use the Service for unlawful, fraudulent, or abusive purposes;</li>
          <li>provide false goal outcomes or manipulate judging;</li>
          <li>interfere with the Service, other users, or payment systems;</li>
          <li>reverse engineer or scrape the Service except as permitted by law.</li>
        </ul>
      </LegalSection>

      <LegalSection title="10. Intellectual property">
        <p>
          The Service, including its design, logos, and software, is owned by Owe It or its licensors.
          You retain ownership of content you submit (such as goal titles), but grant us a limited license
          to host and display it to operate the Service.
        </p>
      </LegalSection>

      <LegalSection title="11. Disclaimers">
        <p>
          THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE.&quot; TO THE MAXIMUM EXTENT
          PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY,
          FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT UNINTERRUPTED OR
          ERROR-FREE OPERATION.
        </p>
      </LegalSection>

      <LegalSection title="12. Limitation of liability">
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, OWE IT AND ITS AFFILIATES, OFFICERS, AND SUPPLIERS
          WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES,
          OR FOR LOST PROFITS OR DATA, ARISING FROM YOUR USE OF THE SERVICE. OUR TOTAL LIABILITY FOR ANY
          CLAIM RELATING TO THE SERVICE IS LIMITED TO THE GREATER OF (A) THE AMOUNTS YOU PAID TO US IN
          THE TWELVE MONTHS BEFORE THE CLAIM OR (B) USD $100, EXCEPT WHERE SUCH LIMITATION IS PROHIBITED
          BY LAW.
        </p>
      </LegalSection>

      <LegalSection title="13. Indemnity">
        <p>
          You will indemnify and hold harmless Owe It from claims arising out of your misuse of the
          Service, violation of these Terms, or infringement of third-party rights.
        </p>
      </LegalSection>

      <LegalSection title="14. Suspension and termination">
        <p>
          We may suspend or terminate your access if you breach these Terms or if required for legal,
          security, or operational reasons. You may delete your account in settings, subject to
          outstanding goals, charges, or judge commitments described in the app.
        </p>
      </LegalSection>

      <LegalSection title="15. Governing law and disputes">
        <p>
          These Terms are governed by the laws of the State of Israel, without regard to conflict-of-law
          rules, except where mandatory consumer protections in your country of residence apply. Courts
          in Tel Aviv-Yafo, Israel shall have exclusive jurisdiction for disputes not subject to
          mandatory arbitration or consumer venue rules, unless applicable law requires otherwise.
        </p>
      </LegalSection>

      <LegalSection title="16. Changes">
        <p>
          We may update these Terms from time to time. We will post the revised Terms in the Service and
          update the effective date. Material changes may be notified via the app or email where
          appropriate. Continued use after the effective date constitutes acceptance.
        </p>
      </LegalSection>

      <LegalSection title="17. Contact">
        <p>
          Questions about these Terms:{' '}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
        </p>
      </LegalSection>
    </LegalDocumentLayout>
  );
}
