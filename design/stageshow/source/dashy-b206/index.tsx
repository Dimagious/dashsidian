import { ChevronLeft, ChevronRight, CheckSquare, Hash, Menu as MenuIcon, PlusCircle, Square } from 'lucide-react'
import { Phone, Roll, Stage, type Act } from '../../kit'
import { LineChart, Heatmap, SLEEP_BANDS, SLEEP_TODAY, StatCard, Swatch, sleepColor } from '../dashy-shared/dashy'
import './b206.css'

// B-206: the dashboard on a phone. Beats: a tap on a cell shows its value on
// the block's own status line, in the plugin's own wording; a second tap on
// the same cell opens that day's note, holding the same value; Back returns to
// the page, which redraws with no selection, so the loop closes on the opening.
// The phone is pinned from the bottom: Obsidian's navigation bar is where Back
// lives, so the crop takes the top of the screen.

const DAY = '2026-10-06'
type S = { selected: boolean; open: boolean }
const REST = { x: 60, y: 330 }

async function script(a: Act<S>) {
  await a.wait(1000)
  a.mark('tap')
  await a.click('cell')
  a.put({ selected: true })
  await a.wait(1800)
  a.mark('open')
  await a.click('cell')
  a.put({ open: true })
  await a.wait(300)
  a.mark('payoff')
  await a.wait(1700)
  a.mark('back')
  await a.click('back')
  a.put({ open: false, selected: false })
  await a.wait(800)
  await a.move(REST)
  await a.wait(100)
}

export default function B206() {
  return (
    <Stage<S> width={480} height={600} initial={{ selected: false, open: false }} poster={{ selected: true, open: true }} script={script} cursor={{ at: REST, style: 'touch' }} className="b206">
      {(s) => (
        <>
          <Phone width={400} frame="pro" className="b206-phone">
            <div className="dy-app b206-app">
              <div className="b206-page" data-on={!s.open || undefined}>
                <div className="b206-spacer" />
                <div className="dy-inline-title">Sleep</div>
                <div className="dy-stats b206-stats">
                  <StatCard value={81.1} digits={1} label="Sleep this week" />
                  <StatCard value={7} unit="days" label="Nights over 80" />
                </div>
                <div className="b206-hm">
                  <Heatmap
                    title="Sleep (2026)"
                    today={SLEEP_TODAY}
                    weeks={21}
                    cell={13}
                    color={sleepColor}
                    selected={s.selected ? DAY : undefined}
                    cellTarget={DAY}
                    status={<div className="b206-status"><Roll variant="fade">{s.selected ? 'Oct 6, 2026: sleep_score 88 (2026-10-06)' : ' '}</Roll></div>}
                    legend={<>
                      <Swatch color={SLEEP_BANDS[0]!}>90+</Swatch>
                      <Swatch color={SLEEP_BANDS[1]!}>80–89</Swatch>
                      <Swatch color={SLEEP_BANDS[2]!}>70–79</Swatch>
                    </>}
                  />
                </div>
                <div className="dy-block-title b206-t">sleep_score: last 30 days</div>
                <LineChart values={[81, 79, 84, 86, 85, 81, 77, 76, 78, 83, 85, 84, 80, 82, 88, 83]} labels={['10 Sep', '25 Sep', '9 Oct']} min={70} max={90} height={110} />
              </div>
              <div className="b206-page" data-on={s.open || undefined}>
                <div className="b206-spacer" />
                <div className="dy-inline-title">2026-10-06</div>
                <div className="b206-props">Properties</div>
                <div className="b206-prop"><Hash size={18} strokeWidth={1.75} /><span>sleep_score</span><b>88</b></div>
                <div className="b206-prop"><Hash size={18} strokeWidth={1.75} /><span>steps</span><b>10860</b></div>
                <div className="b206-prop"><CheckSquare size={18} strokeWidth={1.75} /><span>gym</span><i data-on><svg viewBox="0 0 16 16" width="19" height="19" aria-hidden><path d="M3.8 8.3 6.8 11.2 12.2 5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></i></div>
                <div className="b206-text">Slept through for once. Long walk before work, legs at the gym after.</div>
                <div className="dy-block-title b206-h">To do</div>
                <ul className="b206-list"><li>Book the physio</li><li>Finish Piranesi</li><li>Pack for the weekend</li><li>Call the bank</li></ul>
              </div>
              <div data-crop className="b206-nav">
                <span data-target="back" data-cursor="pointer"><ChevronLeft size={24} strokeWidth={1.75} /></span>
                <ChevronRight size={24} strokeWidth={1.75} />
                <PlusCircle size={24} strokeWidth={1.75} />
                <span className="b206-tabs"><Square size={24} strokeWidth={1.75} /><em>1</em></span>
                <MenuIcon size={24} strokeWidth={1.75} />
              </div>
            </div>
          </Phone>
        </>
      )}
    </Stage>
  )
}
