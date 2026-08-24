"""Regenerate the spot-check tables in docs/PROTOTYPE_results.html.

Committed for provenance. The prototype's 84 data rows are static HTML with
numbers baked in, and without this script nobody could reproduce or refresh
them - a doc quoting figures that cannot be regenerated is a doc that will
eventually be wrong without anyone noticing.

Everything here is out-of-sample: the model is fitted on pre-cutoff data only,
and every game shown arrived after that cutoff, so nothing was seen in training.
Cards are rendered AS OF THE CUTOFF rather than today, because these games have
all since arrived - measuring "overdue" against today would flag every row.

Writes an HTML fragment to scratch_spotcheck.html for pasting into the prototype.
Run from the repo root: python -m pipeline.spotcheck
"""
import html
import numpy as np
import pandas as pd

from pipeline import config
from pipeline.train import _prepare
from pipeline.calibrate import fit_with_conformal
from pipeline.holdout import CUTOFFS, TODAY

MONTH = 30.44
CHIP = {'Xbox': 'p-xbox', 'PSPlus': 'p-ps', 'Epic': 'p-epic', 'HumbleBundle': 'p-humble'}
NICE = {'Xbox': 'Xbox Game Pass', 'PSPlus': 'PS Plus Extra',
        'Epic': 'Epic Games Store', 'HumbleBundle': 'Humble Choice'}


def grain(width_m, arrival, overdue):
    if overdue:
        return 'G', 'overdue'
    if width_m < 24:
        return 'A', 'month'
    if width_m < 48:
        return 'B', 'year'
    if width_m < 96:
        return 'C', 'floor'
    return 'D', 'suppressed'


def shown(tier, lo, mid, hi, overdue):
    """What the card would actually display."""
    if tier == 'G':
        return f'Could be any time now &middot; we expected {mid:%b %Y}'
    if tier == 'A':
        return f'<b>{mid:%b %Y}</b> &middot; {lo:%b %Y} to {hi:%b %Y}'
    if tier == 'B':
        return f'<b>sometime in {mid:%Y}</b> &middot; {lo:%Y} to {hi:%Y}'
    if tier == 'C':
        return f'<b>not before {lo:%Y}</b> &middot; possibly much later'
    return '<b>can&apos;t narrow this down</b>'


def rows_for(name, csv_path, other_pool):
    df = _prepare(pd.read_csv(csv_path))
    cut = pd.Timestamp(CUTOFFS[name])
    pre = df[df['added_to_service'] <= cut]
    post = df[(df['added_to_service'] > cut) & (df['added_to_service'] <= TODAY)].copy()

    fit = fit_with_conformal(pre)
    known = set(fit['params']['te_map'].keys())

    # one real game absent from this platform's list, taken from another
    # platform's data so its publisher and release date are genuine
    mine = set(df['game_name'].astype(str).str.lower())
    outsider = None
    for _, cand in other_pool.iterrows():
        if str(cand['game_name']).lower() not in mine:
            outsider = cand
            break

    sample = post.sample(min(10, len(post)), random_state=11).copy()
    sample['__outsider'] = False
    if outsider is not None:
        o = outsider.copy()
        o['__outsider'] = True
        sample = pd.concat([sample, o.to_frame().T], ignore_index=True)

    X = fit['featurize'](sample)
    s = np.sort(np.vstack([fit['models']['0.1'].predict(X),
                           fit['models']['0.5'].predict(X),
                           fit['models']['0.9'].predict(X)]), axis=0)
    off = fit['offset_sym']
    lo_d, mid_d, hi_d = np.exp(s[0] - off), np.exp(s[1]), np.exp(s[2] + off)

    out = []
    for i, (_, r) in enumerate(sample.iterrows()):
        rel = pd.Timestamp(r['release_date'])
        lo, mid, hi = (rel + pd.Timedelta(days=float(d)) for d in (lo_d[i], mid_d[i], hi_d[i]))
        width_m = (hi_d[i] - lo_d[i]) / MONTH
        # Render the card AS OF THE CUTOFF, not today. These games have all since
        # arrived, so measuring "overdue" against today would flag every one of
        # them - the prediction is only meaningful at the moment it was made.
        overdue = mid < cut
        tier, label = grain(width_m, mid, overdue)
        pub = str(r['primary_publisher'])
        out.append({
            'game': str(r['game_name']),
            'pub': pub,
            'pub_known': pub in known,
            'outsider': bool(r['__outsider']),
            'width': width_m,
            'tier': tier, 'label': label,
            'shown': shown(tier, lo, mid, hi, overdue),
            'actual_months': (None if r['__outsider']
                              else float(r['days_to_service']) / MONTH),
            'mid_months': mid_d[i] / MONTH,
            'lo_months': lo_d[i] / MONTH,
            'hi_months': hi_d[i] / MONTH,
        })
    return out


def main():
    pools = {}
    for p in config.TRAIN_PLATFORMS:
        pools[p['name']] = _prepare(pd.read_csv(p['input']))

    per = {}
    names = [p['name'] for p in config.TRAIN_PLATFORMS]
    for p in config.TRAIN_PLATFORMS:
        others = [pools[n] for n in names if n != p['name']]
        pool = pd.concat(others, ignore_index=True).sample(frac=1, random_state=5)
        per[p['name']] = rows_for(p['name'], p['input'], pool)

    # ---------------- section 1: what the user would see ----------------
    a = ['  <div class="variant" id="v-spot">',
         '    <p class="label-strip">Spot check &mdash; what the card would show for real games</p>',
         '    <div class="card">',
         '      <h2>Spot check</h2>',
         '      <p class="reasoning" style="max-width:none;margin-bottom:22px">Ten games per service, plus one that is not in that service&apos;s list at all. Every prediction is out-of-sample: the model was fitted on data ending before any of these arrived.</p>']
    for name in names:
        a.append(f'      <p class="label-strip" style="margin-top:26px">'
                 f'<span class="chip-inline {CHIP[name]}">{NICE[name]}</span></p>')
        a.append('      <div class="scroll"><table>')
        a.append('        <thead><tr><th>Game</th><th>Publisher</th><th class="num">Grain</th><th>What the card shows</th></tr></thead>')
        a.append('        <tbody>')
        for r in per[name]:
            flag = ' <span class="tag">not in list</span>' if r['outsider'] else ''
            unk = '' if r['pub_known'] else ' <span class="tag warn-tag">unseen</span>'
            a.append(f'          <tr><td class="gname">{html.escape(r["game"])[:44]}{flag}</td>'
                     f'<td class="gpub">{html.escape(r["pub"])[:26]}{unk}</td>'
                     f'<td class="num"><span class="grain g-{r["tier"]}">{r["tier"]}</span> {r["label"]}</td>'
                     f'<td class="gshow">{r["shown"]}</td></tr>')
        a.append('        </tbody></table></div>')
    a.append('    </div>')
    a.append('''    <p class="note-strip">
      The grain column is the tier the routing picks, driven only by how wide the
      calibrated range came out. Nothing here is hand-assigned. Games from publishers
      never seen in training are marked <b>unseen</b> &mdash; they fall back to the
      overall prior, which is why their ranges are the widest on the page.
    </p>''')
    a.append('  </div>')

    # ---------------- section 2: accuracy against known outcomes -------
    b = ['  <div class="variant" id="v-acc">',
         '    <p class="label-strip">Holdout accuracy &mdash; predictions against what actually happened</p>',
         '    <div class="card">',
         '      <h2>Holdout accuracy</h2>',
         '      <p class="reasoning" style="max-width:none;margin-bottom:22px">The same games, now with the answer. All figures are months of wait between release and arrival. A hit means the true wait fell inside the shown range.</p>']
    for name in names:
        rs = [r for r in per[name] if r['actual_months'] is not None]
        hits = sum(1 for r in rs if r['lo_months'] <= r['actual_months'] <= r['hi_months'])
        b.append(f'      <p class="label-strip" style="margin-top:26px">'
                 f'<span class="chip-inline {CHIP[name]}">{NICE[name]}</span> '
                 f'&mdash; {hits} of {len(rs)} inside the range</p>')
        b.append('      <div class="scroll"><table>')
        b.append('        <thead><tr><th>Game</th><th class="num">Range</th><th class="num">Best guess</th><th class="num">Actual</th><th class="num">Miss by</th><th></th></tr></thead>')
        b.append('        <tbody>')
        for r in rs:
            hit = r['lo_months'] <= r['actual_months'] <= r['hi_months']
            miss = abs(r['mid_months'] - r['actual_months'])
            b.append(f'          <tr><td class="gname">{html.escape(r["game"])[:40]}</td>'
                     f'<td class="num">{r["lo_months"]:.0f} to {r["hi_months"]:.0f}</td>'
                     f'<td class="num">{r["mid_months"]:.0f}</td>'
                     f'<td class="num"><b>{r["actual_months"]:.0f}</b></td>'
                     f'<td class="num">{miss:.0f} mo</td>'
                     f'<td class="num">{"<span class=hit>hit</span>" if hit else "<span class=miss>missed</span>"}</td></tr>')
        b.append('        </tbody></table></div>')
    b.append('    </div>')
    b.append('''    <p class="note-strip">
      Read the <b>miss by</b> column rather than the hit rate. A hit only says the
      truth landed somewhere in the range, and a wide enough range makes that easy;
      the miss column says how far the single best guess actually was. Notice the
      best guess is almost always <b>lower</b> than the actual, which is the
      systematic optimism the range has to absorb.
    </p>''')
    b.append('  </div>')

    open('scratch_spotcheck.html', 'w', encoding='utf-8', newline='\n').write(
        '\n'.join(a) + '\n\n' + '\n'.join(b) + '\n')
    print('wrote scratch_spotcheck.html')
    for name in names:
        rs = [r for r in per[name] if r['actual_months'] is not None]
        tiers = {}
        for r in per[name]:
            tiers[r['tier']] = tiers.get(r['tier'], 0) + 1
        print(f'  {name:13s} tiers={tiers}  '
              f'hits={sum(1 for r in rs if r["lo_months"]<=r["actual_months"]<=r["hi_months"])}/{len(rs)}')


if __name__ == '__main__':
    main()
