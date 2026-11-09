import { CheckSquare, Hash, Timer } from 'lucide-react'
import { Stage, type Act } from '../../kit'
import { GYM_TODAY, Heatmap, ORANGE, StatCard, Swatch, TabBar, gymOn, gymTotal, ObsidianApp } from '../dashy-shared/dashy'
import './b203w.css'

// B-203, wide cut for the site: the note and the dashboard side by side. One checkbox moves the dashboard. Beats: the cursor ticks `gym` in
// today's Properties; a beat later the counts roll and today's cell paints;
// the result holds; the same checkbox is unticked and everything follows it
// back, so the reset has a seen cause. No agent and no YAML on screen.
//
// Numbers are the invented data's own: current_streak forgives an unfilled
// today, so it reads 3 before the tick and 4 after; `compare` holds the same
// days of last week, so "was 3" does not move.
//
// Real strings: the note names, three properties, three cards, the grid title.

type S = { ticked: boolean; counted: boolean }
const REST = { x: 200, y: 250 }

async function script(a: Act<S>) {
  await a.wait(900)
  a.mark('tick')
  await a.click({ at: 'gym', x: 0.5, y: 0.5 })
  a.put({ ticked: true })
  await a.wait(220)
  a.put({ counted: true })
  await a.move({ x: 210, y: 235 })
  a.mark('payoff')
  await a.wait(2600)
  a.mark('untick')
  await a.click({ at: 'gym', x: 0.5, y: 0.5 })
  a.put({ ticked: false })
  await a.wait(220)
  a.put({ counted: false })
  await a.wait(900)
  await a.move(REST)
  await a.wait(150)
}

export default function B203Wide() {
  return (
    <Stage<S> width={720} height={420} initial={{ ticked: false, counted: false }} poster={{ ticked: true, counted: true }} script={script} cursor={{ at: REST, style: 'large', ripple: true }} className="dy-film b203w">
      {(s) => (
        <div className="b203w-row">
        <ObsidianApp className="b203w-left" tabs={<TabBar tabs={['2026-10-09']} active={0} />}>
          <div data-crop className="dy-pane b203-note">
            <div className="dy-body">
              <div className="dy-inline-title">2026-10-09</div>
              <div className="b203-props">Properties</div>
              <div className="b203-prop">
                <CheckSquare size={15} strokeWidth={1.75} /><span className="b203-key">gym</span>
                <span className="b203-box" data-target="gym" data-cursor="pointer" data-on={s.ticked || undefined}>
                  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden><path d="M3.8 8.3 6.8 11.2 12.2 5" fill="none" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
              </div>
              <div className="b203-prop"><Timer size={15} strokeWidth={1.75} /><span className="b203-key">sleep</span><span>7h 38min</span></div>
              <div className="b203-prop"><Hash size={15} strokeWidth={1.75} /><span className="b203-key">steps</span><span>10412</span></div>
            </div>
          </div>
        </ObsidianApp>
        <ObsidianApp tabs={<TabBar tabs={['Habits']} active={0} />}>
          <div data-crop className="dy-pane b203-dash">
            <div className="dy-body">
              <div className="dy-stats b203-stats">
                <StatCard value={s.counted ? 4 : 3} label="Gym this week" compare={s.counted ? { text: '▲ +1', was: '(was 3)', tone: 'up' } : { text: '= 0', was: '(was 3)', tone: 'flat' }} />
                <StatCard value={s.counted ? 4 : 3} unit="days" label="Current streak" />
                <StatCard value={gymTotal + (s.counted ? 1 : 0)} label="Gym days" />
              </div>
              <div className="b203-hm">
                <Heatmap
                  title="Gym (2026)"
                  today={GYM_TODAY}
                  weeks={18}
                  cell={18}
                  color={(k) => (gymOn(k) || (k === GYM_TODAY && s.counted) ? ORANGE : undefined)}
                  legend={<Swatch color={ORANGE}>has data</Swatch>}
                />
              </div>
            </div>
          </div>
        </ObsidianApp>
        </div>
      )}
    </Stage>
  )
}
