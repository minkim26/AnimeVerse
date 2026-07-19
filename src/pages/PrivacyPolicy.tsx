import Navbar from '../components/Navbar.tsx'
import Footer from '../components/Footer.tsx'

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-3xl mx-auto px-4 py-12 w-full">
        <span className="pill w-fit text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
          Legal
        </span>
        <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-[var(--color-ink)] mt-4 mb-8">
          Privacy Policy
        </h1>

        <article className="surface-card p-6 sm:p-10">
          <p className="text-[var(--color-ink)] leading-relaxed mb-6">
            This Privacy Policy outlines how AnimeVerse <strong>collects, uses, maintains, and discloses information
            collected from users.</strong>
          </p>

          <h2 className="font-display text-xl font-semibold tracking-tight mb-2 text-[var(--color-ink)]">
            Personal Identification Information
          </h2>
          <p className="text-[var(--color-ink)] leading-relaxed mb-6">
            We may collect personal identification information from Users in a variety of ways, including, but not
            limited to, when Users visit our site, register on the site, and in connection with other activities,
            services, features, or resources we make available on our Site. Users may be asked for, as appropriate,
            name, email address. Users may, however, visit our Site anonymously.
          </p>

          <h2 className="font-display text-xl font-semibold tracking-tight mb-2 text-[var(--color-ink)]">
            How we use collected information
          </h2>
          <p className="text-[var(--color-ink)] leading-relaxed mb-2">
            AnimeVerse may collect and use Users personal information for the following purposes:
          </p>
          <ul className="list-disc pl-6 mb-6 space-y-2 text-[var(--color-ink)] leading-relaxed">
            <li>
              <strong>To personalize user experience:</strong> We may use information in the aggregate to understand
              how our Users as a group use the services and resources provided on our Site.
            </li>
            <li>
              <strong>To improve our Site:</strong> We continually strive to improve our website offerings based on
              the information and feedback we receive from you.
            </li>
          </ul>

          <h2 className="font-display text-xl font-semibold tracking-tight mb-2 text-[var(--color-ink)]">
            Your acceptance of these terms
          </h2>
          <p className="text-[var(--color-ink)] leading-relaxed">
            By using this Site, you signify your <strong>acceptance</strong> of this policy.{' '}
            <strong>If you do not agree to this policy, please do not use our Site.</strong>
          </p>
        </article>
      </main>

      <Footer />
    </div>
  )
}
