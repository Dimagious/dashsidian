import { Roll, Stage, type Act } from '../../kit'
import { Bars, StatCard, Swatch, TabBar, ViewHeader, ObsidianApp } from '../dashy-shared/dashy'
import './b205.css'

// B-205: a review counts its own week. Two tabs, one set of blocks with
// `period: note`. The `today` line and its chips stay put; everything under
// them changes with the note's name. W41's "was" values are W40's own numbers,
// and each week's bars average to its steps card.

const WEEKS = {
  W40: {
    title: '2026-W40', caption: 'Steps: sum per day, Sep 28, 2026 to Oct 4, 2026',
    sleep: 79.6, sleepCmp: { text: '▼ −0.6', was: '(was 80.2)', tone: 'down' as const },
    gym: 3, gymCmp: { text: '▼ −1', was: '(was 4)', tone: 'down' as const },
    steps: 10012, stepsCmp: { text: '▼ −108', was: '(was 10\u202f120)', tone: 'down' as const },
    bars: [7200, 11800, 12900, 9100, 8100, 12400, 8584],
    days: ['28 Sep', '29 Sep', '30 Sep', '1 Oct', '2 Oct', '3 Oct', '4 Oct'],
  },
  W41: {
    title: '2026-W41', caption: 'Steps: sum per day, Oct 5, 2026 to Oct 11, 2026',
    sleep: 81.1, sleepCmp: { text: '▲ +1.5', was: '(was 79.6)', tone: 'up' as const },
    gym: 4, gymCmp: { text: '▲ +1', was: '(was 3)', tone: 'up' as const },
    steps: 10315, stepsCmp: { text: '▲ +303', was: '(was 10\u202f012)', tone: 'up' as const },
    bars: [9480, 10860, 13120, 12350, 10420, 8410, 7565],
    days: ['5 Oct', '6 Oct', '7 Oct', '8 Oct', '9 Oct', '10 Oct', '11 Oct'],
  },
}

type S = { week: 'W40' | 'W41' }
const REST = { x: 340, y: 120 }

async function script(a: Act<S>) {
  await a.wait(1000)
  a.mark('w41')
  await a.click({ at: 'tab-w41', x: 0.68, y: 0.6 })
  a.put({ week: 'W41' })
  await a.move(REST, { duration: 700 })
  a.mark('payoff')
  await a.wait(2600)
  a.mark('back')
  await a.click({ at: 'tab-w40', x: 0.68, y: 0.6 })
  a.put({ week: 'W40' })
  await a.move(REST, { duration: 700 })
  await a.wait(900)
}

export default function B205() {
  return (
    <Stage<S> width={480} height={600} initial={{ week: 'W40' }} poster={{ week: 'W41' }} script={script} cursor={{ at: REST, style: 'large', ripple: true }} className="b205">
      {(s) => {
        const w = WEEKS[s.week]
        return (
          <ObsidianApp tabs={<TabBar tabs={['2026-W40', '2026-W41']} active={s.week === 'W40' ? 0 : 1} targets={['tab-w40', 'tab-w41']} />}>
            <ViewHeader title={w.title} />
            <div className="dy-body b205-body">
              <div className="dy-inline-title"><Roll variant="fade">{w.title}</Roll></div>
              <div className="b205-today">
                <div className="dy-block-title">Friday, October 16, 2026</div>
                <div className="b205-chips">
                  <span className="b205-chip"><u>Today</u> <small>2026-10-16</small></span>
                  <span className="b205-chip"><u>This week</u> <small>2026-W42</small></span>
                </div>
              </div>
              <div className="dy-stats b205-stats">
                <StatCard value={w.sleep} digits={1} label="Sleep" compare={w.sleepCmp} />
                <StatCard value={w.gym} label="Gym days" compare={w.gymCmp} />
                <StatCard value={w.steps} label="Steps a day" compare={w.stepsCmp} />
              </div>
              <div className="dy-block-title b205-t"><Roll variant="fade">{w.caption}</Roll></div>
              <Bars values={w.bars} labels={w.days} goal={10000} max={15000} height={196} />
              <div className="b205-leg"><Swatch color="#a9a9a9">goal 10000</Swatch></div>
            </div>
          </ObsidianApp>
        )
      }}
    </Stage>
  )
}
