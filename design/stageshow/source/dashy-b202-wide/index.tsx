import { Caret, Collapse, Stage, type Act } from '../../kit'
import { ProgressRow, TabBar, ObsidianApp } from '../dashy-shared/dashy'
import './b202w.css'

// B-202, wide cut for the README's full-width hero: the terminal beside the note,
// so the block and the bar it draws are on screen together. A request becomes a block. Beats: the request is typed; the agent
// reads the vault profile and finds `finished` under Books; it writes the
// README's own block; the note draws it as a bar towards 24. Keyboard story,
// no cursor. The terminal is docked at the foot, as an integrated one is, and
// grows as the agent answers; the block lands at the head of the note. The added lines leave in one reverse stagger, and the prompt
// empties last, so the loop returns to the opening picture.
//
// Real strings: the request, the two tool lines, the block, the bar, the note.

const ASK = 'Count the books I finished this year against a goal of 24.'
const YAML = ['```progress', 'source: Books', 'date_field: finished', 'period: year', 'items:', '  - { label: Books this year, agg: count, goal: 24 }', '```']

type S = { draft: string; read: boolean; found: boolean; edit: boolean; lines: number; block: boolean; fill: number }
const initial: S = { draft: '', read: false, found: false, edit: false, lines: 0, block: false, fill: 0 }
const poster: S = { draft: ASK, read: true, found: true, edit: true, lines: YAML.length, block: true, fill: 16 / 24 }

async function script(a: Act<S>) {
  await a.wait(600)
  a.mark('ask')
  await a.type('draft', ASK, { interval: 20 })
  await a.wait(200)
  a.put({ read: true })
  await a.wait(350)
  a.put({ found: true })
  await a.wait(450)
  a.put({ edit: true })
  await a.wait(160)
  for (let i = 1; i <= YAML.length; i++) {
    a.put({ lines: i })
    await a.wait(60)
  }
  await a.wait(500)
  a.mark('block')
  a.put({ block: true })
  await a.wait(300)
  a.put({ fill: 16 / 24 })
  await a.wait(500)
  await a.wait(500)
  a.mark('payoff')
  await a.wait(2200)
  a.put({ block: false, fill: 0 })
  await a.wait(70)
  a.put({ edit: false, lines: 0 })
  await a.wait(70)
  a.put({ found: false, read: false })
  await a.wait(70)
  a.put({ draft: '' })
  await a.wait(500)
}

export default function B202Wide() {
  return (
    <Stage<S> width={720} height={420} initial={initial} poster={poster} script={script} className="dy-film b202w">
      {(s) => (
        <div className="b202w-row">
          <div data-crop className="b202-term">
                        <div className="ss-term">
              <div className="b202-prompt"><span>❯</span><span data-typing>{s.draft}{s.read ? null : <Caret />}</span></div>
              <Collapse open={s.read}>
                <div className="b202-tool">Read <span>.dashy/vault-profile.md</span></div>
              </Collapse>
              <Collapse open={s.found}>
                <div className="b202-out">finished: a date, in the notes under Books</div>
              </Collapse>
              <Collapse open={s.edit}>
                <div className="b202-tool">Edit <span>Reading.md</span> <em>+7 lines</em></div>
              </Collapse>
              <div className="b202-code">
                {YAML.map((l, i) => (
                  <Collapse key={l} open={i < s.lines}><div className="b202-line">{l}</div></Collapse>
                ))}
              </div>
            </div>
          </div>
          <ObsidianApp className="b202-app" tabs={<TabBar tabs={['Reading']} active={0} />}>
          <div data-crop className="dy-pane b202-note">
                        <div className="dy-body">
              <div className="dy-inline-title">Reading</div>
              <Collapse open={s.block} reveal="drop">
                <div className="b202-block"><ProgressRow label="Books this year" value={16} goal={24} fill={s.fill} /></div>
              </Collapse>
              <div className="b202-h">Finished lately</div>
              <ul className="b202-list">
                {['Piranesi', 'The Left Hand of Darkness', 'Middlemarch', 'Station Eleven', 'The Dispossessed', 'Kindred', 'Beloved', 'Dune', 'Emma', 'The Trial', 'Circe', 'Solaris', 'Ulysses', 'Persuasion', 'Frankenstein'].map((b) => <li key={b}><span>{b}</span></li>)}
              </ul>
            </div>
          </div>
          </ObsidianApp>
        </div>
      )}
    </Stage>
  )
}
