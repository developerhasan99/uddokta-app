import { Pencil } from 'lucide-react'
import { Badge, Button, Card, Field, IconButton, Notice, PageHeader, Skeleton } from '../components/ui'

const colors = ['frame', 'paper', 'paper-2', 'paper-3', 'rule', 'muted', 'ink-2', 'ink', 'success-soft', 'info-soft', 'warning-soft', 'error-soft']
const sizes = ['sm', 'md', 'lg', 'xl', '2xl']

export function DesignSystem() {
  return (
    <div className="page page--narrow">
      <PageHeader title="Design system" description="Tokens and components, in Bangla and English." />
      <Card title="Colour">
        <ul className="swatches">
          {colors.map((c) => (
            <li key={c}>
              <span className="swatch" style={{ background: `var(--color-${c})` }} />
              <span className="muted">{c}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Type">
        {sizes.map((s) => (
          <p key={s} style={{ fontSize: `var(--text-${s})` }}>{s}: আজকের অর্ডার ৳১,২৫০ / Today’s orders ৳1,250</p>
        ))}
      </Card>
      <Card title="Buttons">
        <div className="row">
          <Button variant="primary">অর্ডার নিশ্চিত করুন</Button>
          <Button>বাতিল</Button>
          <Button variant="danger">মুছে ফেলুন</Button>
          <IconButton label="সম্পাদনা করুন"><Pencil size={16} aria-hidden="true" /></IconButton>
          <Button disabled>নিষ্ক্রিয়</Button>
          <Button aria-busy="true">সেভ হচ্ছে</Button>
        </div>
      </Card>
      <Card title="Badges">
        <div className="row">
          <Badge>নিশ্চিত</Badge>
          <Badge tone="info">নতুন</Badge>
          <Badge tone="warning">হোল্ডে</Badge>
          <Badge tone="success">ডেলিভারি হয়েছে</Badge>
          <Badge tone="danger">ফেরত এসেছে</Badge>
        </div>
      </Card>
      <Card title="Fields">
        <div className="stack">
          <Field id="ds-name" name="name" label="কাস্টমারের নাম" help="ডেলিভারির জন্য পুরো নাম দিন।" autoComplete="off" />
          <Field id="ds-phone" name="phone" label="মোবাইল নম্বর" type="tel" error="নম্বরটি ১১ সংখ্যার হতে হবে। যেমন 01700000000।" defaultValue="0170" autoComplete="off" />
          <Field id="ds-off" name="off" label="নিষ্ক্রিয় ঘর" disabled defaultValue="বদলানো যাবে না" />
        </div>
      </Card>
      <Card title="Loading">
        <div className="stack">
          <Skeleton />
          <Skeleton width="60%" />
        </div>
      </Card>
      <section className="card card--flush">
        <Notice title="খালি অবস্থা" body="এখানে কী থাকবে আর কী করলে এটি ভরবে, তা এক লাইনে বলুন।" action={<Button>পণ্য যোগ করুন</Button>} />
      </section>
    </div>
  )
}
