import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal/LegalPage'
import { CONTACT_EMAIL } from '@/lib/agent'

export const metadata: Metadata = { title: 'Terms of Service · AIMORO' }

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="October 16, 2026">
      <p>These terms explain how AIMORO works when you use aimoro.co to request, buy and receive products. By creating an account or placing a request, you agree to them.</p>

      <section>
        <h2>1. What we do</h2>
        <p>AIMORO is a personal shopping and delivery service. You tell us what you want, we find it from suppliers, send you a quote, buy it on your behalf once you have paid, and deliver it to the address on your request. Our service is complete once your order is delivered to that address.</p>
      </section>

      <section>
        <h2>2. Your account</h2>
        <ul>
          <li>Give us accurate contact details and a delivery address we can reach.</li>
          <li>Keep your password private. You are responsible for requests made from your account.</li>
          <li>We may close accounts used for fraud, abuse or restricted items.</li>
        </ul>
      </section>

      <section>
        <h2>3. Quotes and prices</h2>
        <ul>
          <li>Each quote shows the product cost, shipping to your address and our service fee, which is a percentage of the product cost.</li>
          <li>Bahamas customs duty and VAT are not included in the quote. You pay them separately when your order clears customs.</li>
          <li>Quotes are valid for 7 days. Supplier prices and exchange rates change, so after that we may send an updated quote.</li>
          <li>Nothing is ordered until you approve a quote and your payment is received.</li>
        </ul>
      </section>

      <section>
        <h2>4. Payment</h2>
        <p>When you approve a quote, we issue an invoice in your account. Pay using one of the methods shown on the invoice. We place your order with the supplier only after payment is confirmed.</p>
      </section>

      <section>
        <h2>5. Cancellations and refunds</h2>
        <ul>
          <li>You can cancel a request at any time before you pay.</li>
          <li>After payment, once we have ordered from the supplier, cancellation may not be possible. Contact us and we will tell you what can be done.</li>
          <li>If we cannot fulfil a paid order, we will refund what you paid for it.</li>
        </ul>
      </section>

      <section>
        <h2>6. Delivery</h2>
        <ul>
          <li>As a guide, air freight takes about 2 to 3 weeks and sea freight about 6 to 8 weeks. Delivery times are estimates. Shipping can be delayed by carriers, weather or other events outside our control.</li>
          <li>Make sure your delivery address is correct. If an order cannot be delivered because the address is wrong or nobody is available, extra delivery costs may apply.</li>
          <li>Your order is considered delivered once it reaches the address on your request.</li>
        </ul>
      </section>

      <section>
        <h2>7. Problems with an order</h2>
        <p>We check orders at our warehouse before they ship. If your item arrives damaged, is not what you requested, or is missing, email us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> within 7 days of delivery with your request number and photos. We will review it and replace the item or refund the item cost.</p>
      </section>

      <section>
        <h2>8. Items we do not handle</h2>
        <p>We do not source or ship batteries, liquids, weapons or weapon parts, illegal items, or anything carriers or local laws restrict. We may decline any request.</p>
      </section>

      <section>
        <h2>9. Responsibility</h2>
        <p>We take care in choosing suppliers and checking orders, but products are made by third parties. To the extent the law allows, our responsibility for any order is limited to the amount you paid us for it.</p>
      </section>

      <section>
        <h2>10. Changes and contact</h2>
        <p>We may update these terms. The date at the top shows the latest version. Questions? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
      </section>
    </LegalPage>
  )
}
