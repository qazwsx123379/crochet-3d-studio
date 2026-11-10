import { useEffect, useMemo, useRef, useState } from 'react';
import { STITCHES, STITCH_BY_CODE } from '../pattern/stitches';
import { parseRound } from '../pattern/parser';

export type ComboKind = 'repeat' | 'same' | 'loop';

interface Props {
  kind: ComboKind;
  rowLabel: string;
  /** Stitches the previous round left, when known. */
  expected?: number;
  onInsert: (text: string) => void;
  onClose: () => void;
}

/** Consecutive identical stitches become one item: X, X, V → [{X,2},{V,1}]. */
function runs(seq: string[]): { code: string; n: number }[] {
  const out: { code: string; n: number }[] = [];
  for (const c of seq) {
    const last = out[out.length - 1];
    if (last && last.code === c) last.n++;
    else out.push({ code: c, n: 1 });
  }
  return out;
}

/**
 * A sequence item is a stitch code, or a same-stitch group written out in
 * brackets ("[2F]"), so a repeat can hold both: (X,[2F])*6.
 */
const isGroup = (item: string) => item.startsWith('[');
export const groupToken = (codes: string[]) => `[${seqText(codes, true)}]`;

/** Text for a sequence; `prefix` writes counts in front (3F) instead of behind (X*2). */
function seqText(seq: string[], prefix: boolean): string {
  return runs(seq).map(({ code, n }) => (n === 1 ? code : prefix && !isGroup(code) ? `${n}${code}` : `${code}*${n}`)).join(',');
}

function itemName(item: string): string {
  if (!isGroup(item)) return STITCH_BY_CODE[item]?.name ?? item;
  const inner = parseRound(item).stitches.map((s) => s.code);
  return `同一針（${runs(inner).map(({ code, n }) => `${STITCH_BY_CODE[code]?.name ?? code}${n > 1 ? ` ${n}` : ''}`).join('＋')}）`;
}

function seqWords(seq: string[]): string {
  return runs(seq).map(({ code, n }) => (isGroup(code) ? `${itemName(code)}${n > 1 ? ` ×${n}` : ''}` : `${itemName(code)} ${n} 針`)).join('、');
}

export function buildCombo(kind: ComboKind, seq: string[], times: number, loop: 'BLO' | 'FLO'): string {
  if (!seq.length) return '';
  if (kind === 'same') return `[${seqText(seq, true)}]${times > 1 ? `*${times}` : ''}`;
  const inner = seqText(seq, false);
  const single = seq.length === 1;
  // One stitch: X*6. A group: (X,V)*6. No repeat: the group as written.
  const body = times <= 1 ? inner : single ? `${inner}*${times}` : `(${inner})*${times}`;
  return kind === 'loop' ? `${loop}(${body})` : body;
}

const EXAMPLES: { kind: ComboKind; seq: string[]; times: number; say: string }[] = [
  { kind: 'repeat', seq: ['X', 'V'], times: 6, say: '短針 1、加針 1，重複 6 次（圓片第 3 圈）' },
  { kind: 'repeat', seq: ['X', 'X', 'A'], times: 6, say: '短針 2、減針 1，重複 6 次（收口）' },
  { kind: 'repeat', seq: ['FV'], times: 6, say: '長針加針，重複 6 次' },
  { kind: 'repeat', seq: ['X', '[2F]'], times: 6, say: '短針 1、同一針 2 長針，重複 6 次' },
  { kind: 'repeat', seq: ['sk', '[5F]', 'sk', 'X'], times: 4, say: '貝殼花：跳 1、同一針 5 長針、跳 1、短針 1，重複 4 次' },
  { kind: 'same', seq: ['F', 'F', 'F'], times: 1, say: '同一針裡鉤 3 個長針' },
  { kind: 'same', seq: ['ch', 'ch', 'F'], times: 4, say: '同一針裡「2 鎖針＋1 長針」，做 4 次' },
  { kind: 'loop', seq: ['X'], times: 30, say: '只鉤後半針，短針 30 針（杯底轉角）' },
];

export default function ComboBuilder({ kind: initial, rowLabel, expected, onInsert, onClose }: Props) {
  const [kind, setKind] = useState<ComboKind>(initial);
  const [seq, setSeq] = useState<string[]>([]);
  /** While not null, stitch taps build a same-stitch group to add to the sequence. */
  const [draft, setDraft] = useState<string[] | null>(null);
  const tap = (code: string) => (draft ? setDraft([...draft, code]) : setSeq((q) => [...q, code]));
  const finishDraft = () => { if (draft?.length) setSeq((q) => [...q, groupToken(draft)]); setDraft(null); };
  const [times, setTimes] = useState(initial === 'same' ? 1 : 6);
  const [loop, setLoop] = useState<'BLO' | 'FLO'>('BLO');
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);

  const text = buildCombo(kind, seq, times, loop);
  const parsed = useMemo(() => (text ? parseRound(text) : null), [text]);
  const unit = useMemo(() => (seq.length ? parseRound(kind === 'same' ? `[${seqText(seq, true)}]` : seqText(seq, false)) : null), [seq, kind]);

  const intro = kind === 'repeat'
    ? '依序點下面的針法，組成「一組」，再設定這組要重複幾次。一組裡也可以放「同一針鉤多針」的群組。'
    : kind === 'same'
      ? '點下面的針法，這些針會全部鉤在「同一個針目」裡（例如 3 長針貝殼、2 鎖 1 長）。'
      : '選前半針或後半針，再點要這樣鉤的針法和針數。';

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="dialog" role="dialog" aria-modal="true" aria-label="組合針法" style={{ width: 'min(760px, 100%)' }}>
        <div className="dialog-head">
          <h2>組合針法</h2>
          <button className="btn ghost icon" aria-label="關閉" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="seg" role="tablist" aria-label="組合方式" style={{ alignSelf: 'flex-start', flexWrap: 'wrap' }}>
            <button aria-pressed={kind === 'repeat'} onClick={() => { setKind('repeat'); if (times === 1) setTimes(6); }}>重複一組</button>
            <button aria-pressed={kind === 'same'} onClick={() => { setKind('same'); setTimes(1); setDraft(null); setSeq((q) => q.filter((x) => !isGroup(x))); }}>同一針鉤多針</button>
            <button aria-pressed={kind === 'loop'} onClick={() => setKind('loop')}>只鉤前／後半針</button>
          </div>
          <p className="muted" style={{ margin: 0 }}>{intro}</p>

          {kind === 'loop' && (
            <div className="seg" role="group" aria-label="前半針或後半針" style={{ alignSelf: 'flex-start' }}>
              <button aria-pressed={loop === 'BLO'} onClick={() => setLoop('BLO')}>後半針 BLO</button>
              <button aria-pressed={loop === 'FLO'} onClick={() => setLoop('FLO')}>前半針 FLO</button>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))', gap: 6 }}>
            {STITCHES.filter((s) => s.code !== 'sk' || kind === 'repeat').map((s) => (
              <button key={s.code} className="st" style={{ height: 50, ...(draft ? { borderColor: 'var(--accent)' } : {}) }} onClick={() => tap(s.code)} title={s.name}>
                <b>{s.code}</b><span>{s.short}</span>
              </button>
            ))}
          </div>

          <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--bg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minHeight: 34 }}>
              <span style={{ fontSize: 13, fontWeight: 700, marginRight: 4 }}>{kind === 'same' ? '同一針裡：' : '一組：'}</span>
              {seq.length === 0 && <span className="muted" style={{ fontSize: 13 }}>還沒選針法，點上面的按鈕加入</span>}
              {runs(seq).map((r, i) => (
                <button key={i} className="chip" title="點一下移除" onClick={() => setSeq((q) => { const idx = runs(q).slice(0, i).reduce((n, x) => n + x.n, 0); const copy = [...q]; copy.splice(idx, 1); return copy; })}>
                  {itemName(r.code)}{r.n > 1 ? ` ×${r.n}` : ''} ✕
                </button>
              ))}
              {seq.length > 0 && <button className="btn ghost sm" onClick={() => setSeq([])}>清除</button>}
            </div>
            {kind !== 'same' && (draft ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', border: '1.5px dashed var(--accent)', borderRadius: 10, padding: '8px 10px', background: 'var(--surface)' }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>同一針裡：</span>
                {draft.length === 0 && <span className="muted" style={{ fontSize: 13 }}>點上面的針法，例如點兩次「長針」</span>}
                {runs(draft).map((r, i) => <span key={i} className="chip" style={{ display: 'inline-flex', alignItems: 'center' }}>{itemName(r.code)}{r.n > 1 ? ` ×${r.n}` : ''}</span>)}
                <span className="spacer" />
                <button className="btn sm" onClick={() => setDraft(null)}>取消</button>
                <button className="btn sm pri" disabled={!draft.length} onClick={finishDraft}>加入這個群組</button>
              </div>
            ) : (
              <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setDraft([])} title="例如短針 1、同一針 2 長針，重複 6 次 → (X,[2F])*6">＋ 加入「同一針」群組</button>
            ))}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              {kind === 'same' ? '這樣做' : kind === 'loop' && seq.length === 1 ? '針數' : '重複'}
              <button className="btn icon sm" aria-label="減少" onClick={() => setTimes((t) => Math.max(1, t - 1))}>−</button>
              <input className="input" type="number" min={1} max={200} value={times} onChange={(e) => setTimes(Math.max(1, Math.min(200, Number(e.target.value) || 1)))} style={{ width: 70, height: 32, textAlign: 'center' }} aria-label="次數" />
              <button className="btn icon sm" aria-label="增加" onClick={() => setTimes((t) => Math.min(200, t + 1))}>＋</button>
              {kind === 'loop' && seq.length === 1 ? '針' : '次'}
            </label>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <span className="muted" style={{ fontSize: 13 }}>寫法</span>
              <code style={{ fontFamily: 'var(--f-mono)', fontSize: 20, fontWeight: 700 }}>{text || '—'}</code>
            </div>
            {parsed && unit && !parsed.errors.length && (
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                {kind === 'same' ? `同一針裡鉤 ${seqWords(seq)}` : `一組是 ${seqWords(seq)}`}
                {times > 1 ? `，做 ${times} 次` : ''}。總共用掉上一圈 <b style={{ color: 'var(--ink)' }}>{parsed.consumed}</b> 針，產生 <b style={{ color: 'var(--ink)' }}>{parsed.produced}</b> 針。
              </p>
            )}
            {parsed && !parsed.errors.length && expected !== undefined && (
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: parsed.consumed === expected ? 'var(--accent-ink)' : 'var(--warn)' }}>
                {parsed.consumed === expected
                  ? `✓ 上一圈有 ${expected} 針，這樣剛好用完`
                  : parsed.consumed < expected
                    ? `上一圈有 ${expected} 針，如果這圈只寫這些，還差 ${expected - parsed.consumed} 針`
                    : `上一圈只有 ${expected} 針，這樣多了 ${parsed.consumed - expected} 針`}
              </p>
            )}
          </div>

          <details>
            <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>常見例子（點一下套用）</summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {EXAMPLES.map((ex) => (
                <button key={ex.say} className="btn" style={{ justifyContent: 'space-between', height: 'auto', padding: '8px 12px', textAlign: 'left' }}
                  onClick={() => { setKind(ex.kind); setSeq(ex.seq); setTimes(ex.times); setLoop('BLO'); setDraft(null); }}>
                  <span>{ex.say}</span><code style={{ fontFamily: 'var(--f-mono)' }}>{buildCombo(ex.kind, ex.seq, ex.times, 'BLO')}</code>
                </button>
              ))}
            </div>
          </details>
        </div>
        <div className="dialog-foot">
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn pri" disabled={!text} onClick={() => onInsert(text)}>插入到 {rowLabel}</button>
        </div>
      </section>
    </div>
  );
}
