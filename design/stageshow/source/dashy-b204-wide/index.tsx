import { Collapse, Stage, type Act } from '../../kit'
import { LineChart, GYM_TODAY, Heatmap, ORANGE, StatCard, Swatch, TabBar, gymOn, gymTotal, ObsidianApp } from '../dashy-shared/dashy'
import './b204w.css'

// B-204: the block says what is wrong. Beats: a working heatmap; Backspace
// turns `field` into `fild`; the grid gives way to the two messages the real
// block draws, in the real order and wording; the letter comes back and the
// grid returns. The loop closes by itself: the end is the opening.
//
// Real strings: the block's source, its two messages, the blocks around it.

type S = { typo: boolean; broken: boolean }

async function script(a: Act<S>) {
  await a.wait(1000)
  a.mark('typo')
  await a.key('backspace')
  a.put({ typo: true })
  await a.wait(320)
  a.put({ broken: true })
  await a.wait(500)
  a.mark('message')
  await a.wait(2500)
  a.mark('fix')
  await a.key('e')
  a.put({ typo: false })
  await a.wait(320)
  a.put({ broken: false })
  await a.wait(1100)
}

export default function B204Wide() {
  return (
    <Stage<S> width={720} height={420} initial={{ typo: false, broken: false }} poster={{ typo: true, broken: true }} script={script} keys="bottom-right" className="dy-film b204w">
      {(s) => (
        <div className="b204w-row">
        <ObsidianApp className="b204w-left" tabs={<TabBar tabs={['Habits']} active={0} />}>
          <div data-crop className="dy-pane b204-source">
            <div className="b204-code">
              <div className="b204-fence">```heatmap</div>
              <div>source: Diary</div>
              <div className="b204-active"><span data-typing className="b204-key">{s.typo ? 'fild: gym' : 'field: gym'}<i className="b204-caret" style={{ left: s.typo ? '2ch' : '3ch' }} /></span></div>
              <div>color: orange</div>
              <div>title: Gym</div>
              <div className="b204-fence">```</div>
            </div>
          </div>
        </ObsidianApp>
        <ObsidianApp tabs={<TabBar tabs={['Habits']} active={0} />}>
          <div data-crop className="dy-pane b204-read">
            <div className="dy-body">
              <div className="dy-stats b204-stats">
                <StatCard value={3} label="Gym this week" />
                <StatCard value={3} unit="days" label="Current streak" />
                <StatCard value={gymTotal} label="Gym days" />
              </div>
              <div className="b204w-swap">
              <Collapse open={s.broken}>
                <div className="b204-diags">
                  <div className="dy-diag" data-level="warning">⚠️ heatmap: Unknown key "fild". Did you mean "field"?</div>
                  <div className="dy-diag" data-level="error">⛔ heatmap: No `field` given. There is no number to colour by.</div>
                </div>
              </Collapse>
              <Collapse open={!s.broken}>
                <div className="b204-grid">
                  <Heatmap title="Gym (2026)" today={GYM_TODAY} weeks={18} cell={18} color={(k) => (gymOn(k) ? ORANGE : undefined)} legend={<Swatch color={ORANGE}>has data</Swatch>} />
                </div>
              </Collapse>
              </div>
              <div className="dy-block-title b204-t">sleep_score: sum per day, last 30 days</div>
              <LineChart values={[88, 84, 80, 79, 81, 85, 88, 83, 79, 78, 80, 84, 87, 86, 82, 78, 77, 79, 84, 86, 85, 81, 77, 76, 78, 83, 85, 84, 80, 82]} labels={['10 Sep', '20 Sep', '30 Sep', '9 Oct']} min={70} max={90} height={120} />
            </div>
          </div>
        </ObsidianApp>
        </div>
      )}
    </Stage>
  )
}
