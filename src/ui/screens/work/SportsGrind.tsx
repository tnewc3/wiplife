import type { SportsView } from '../../../engine/selectors';

export function Section({ title, children, testId }: { title: string; children: React.ReactNode; testId?: string }) {
  return (
    <section className="mt-5" aria-label={title} {...(testId ? { 'data-testid': testId } : {})}>
      <h3 className="text-base font-bold">{title}</h3>
      {children}
    </section>
  );
}

/** The draft card: where scouts project you, in words. */
export function DraftSection({ view }: { view: SportsView }) {
  const p = view.prospect;
  if (!p) return null;
  return (
    <Section title="The draft" testId="draft-card">
      <p className="mt-1" data-testid="draft-projection">
        {p.line}
      </p>
      <p className="text-sm text-muted" data-testid="draft-range">
        {p.best === p.worst ? `Scouts agree: ${p.likely}.` : `On a good day, ${p.best}. On a bad one, ${p.worst}.`}
      </p>
      {p.combine !== 0 && <p className="text-sm text-muted">{p.combine > 0 ? 'Your workouts and interviews have helped.' : 'Your workouts and interviews have cost you.'}</p>}
      {p.passed && <p className="mt-1 text-sm">The draft has passed you by once. Camps and open tryouts are how you earn a deal now.</p>}
    </Section>
  );
}

