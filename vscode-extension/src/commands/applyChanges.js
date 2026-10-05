const path = require('path');
const { requireProject } = require('./common');
const { STALE_MESSAGE } = require('../changes/changePlanner');

const SCHEME = 'aiproject-change';

async function pickProposal(ctx, statuses) {
  const pm = requireProject(ctx);
  const all = (await pm.changes.list()).filter((p) => !statuses || statuses.includes(p.status)).reverse();
  if (!all.length) { ctx.vscode.window.showInformationMessage('AI Project: no change proposals to show.'); return null; }
  const pick = await ctx.vscode.window.showQuickPick(all.map((p) => ({ label: `${p.proposalId} — ${p.title}`, description: `${p.status} · risk ${p.risk} · ${p.files} file(s)`, id: p.proposalId })), { placeHolder: 'Select a change proposal' });
  return pick ? pick.id : null;
}

module.exports = (ctx) => {
  const v = ctx.vscode;
  // Virtual documents so the diff editor can show proposed content without touching the workspace.
  const store = new Map();
  ctx.context.subscriptions.push(v.workspace.registerTextDocumentContentProvider(SCHEME, { provideTextDocumentContent: (uri) => store.get(uri.toString()) || '' }));

  async function review(id) {
    const pm = requireProject(ctx);
    const rec = await pm.changes.get(id);
    if (!rec) return null;
    const summary = [`# ${rec.title}`, '', `Status: **${rec.status}** · Risk: **${rec.impact.risk}** ${rec.impact.riskReasons.length ? `(${rec.impact.riskReasons.join('; ')})` : ''}`, '', rec.rationale || '_No rationale supplied._', '', '## Files', ...rec.files.map((f) => `- \`${f.path}\` — ${f.operation}${f.stale ? ` — **STALE**: ${f.staleReason}` : ` (+${f.added} −${f.removed})`}`), '', '## Impact', `- Dependents: ${rec.impact.dependents.map((d) => d.path).join(', ') || 'none'}`, `- Workflows: ${rec.impact.workflows.map((w) => w.name).join(', ') || 'none'}`, `- Features: ${rec.impact.features.map((f) => f.name).join(', ') || 'none'}`, `- Database entities: ${rec.impact.entities.map((e) => e.name).join(', ') || 'none'}`, '', rec.status === 'STALE' ? `> ${STALE_MESSAGE}` : ''].join('\n');
    const sdoc = await v.workspace.openTextDocument({ language: 'markdown', content: summary });
    await v.window.showTextDocument(sdoc, { preview: true });
    for (const f of rec.files.filter((x) => !x.stale)) {
      const left = v.Uri.parse(`${SCHEME}:/${id}/original/${f.path}`);
      const right = v.Uri.parse(`${SCHEME}:/${id}/proposed/${f.path}`);
      let original = '';
      try { original = Buffer.from(await v.workspace.fs.readFile(v.Uri.file(path.join(pm.root, f.path)))).toString('utf8'); } catch { original = ''; }
      store.set(left.toString(), f.operation === 'CREATE' ? '' : original);
      store.set(right.toString(), f.operation === 'DELETE' ? '' : f.newContent);
      await v.commands.executeCommand('vscode.diff', left, right, `${f.path} (${f.operation}) — proposed`, { preview: false });
    }
    return rec;
  }

  return {
    'aiProject.reviewChanges': async (id) => { const pid = typeof id === 'string' ? id : await pickProposal(ctx); if (pid) return review(pid); },
    'aiProject.applyChanges': async (id) => {
      const pm = requireProject(ctx);
      const pid = typeof id === 'string' ? id : await pickProposal(ctx, ['PROPOSED', 'STALE']);
      if (!pid) return;
      const rec = await review(pid);
      if (!rec) return;
      const needConfirm = pm.config.get('requireApprovalForChanges') !== false;
      try {
        const res = await v.window.withProgress({ location: v.ProgressLocation.Notification, title: `AI Project: applying ${pid}…` }, () => pm.changes.apply(pid, {
          approve: async (r) => {
            if (!needConfirm) return true; // invoking "Apply" after reviewing the diff is itself the approval
            const pick = await v.window.showWarningMessage(`Apply ${r.title}?`, { modal: true, detail: `${r.files.length} file(s) will change. Risk: ${r.impact.risk}. Originals are backed up under ${pm.config.get('aiProjectFolder')}/snapshots/changes/${pid}/.` }, 'Apply changes');
            return pick === 'Apply changes';
          },
          onOutput: (s) => ctx.out.append(s),
        }));
        if (res.status === 'REJECTED') { v.window.showInformationMessage('AI Project: changes were not applied.'); return res; }
        const ver = res.record.verification;
        if (ver && ver.ok === false) {
          const failed = ver.results[ver.results.length - 1];
          const pick = await v.window.showErrorMessage(`Applied, but verification failed at "${failed.label}". See the AI Project output.`, 'Show output', 'Roll back');
          ctx.out.appendLine(failed.output);
          if (pick === 'Show output') ctx.out.show(true);
          if (pick === 'Roll back') { await pm.changes.rollback(pid); v.window.showInformationMessage('AI Project: changes rolled back.'); }
        } else v.window.showInformationMessage(`AI Project: applied ${pid}. ${ver && ver.ran ? `Verification passed (${ver.results.map((r) => r.kind).join(', ')}).` : 'No verification commands were detected in this project.'} Knowledge was rescanned; affected documentation is marked OUTDATED.`);
        ctx.refresh();
        return res;
      } catch (err) {
        if (err.code === 'HASH_MISMATCH') {
          const pick = await v.window.showErrorMessage(`${STALE_MESSAGE}`, { detail: err.message }, 'Analyze again');
          if (pick === 'Analyze again') v.commands.executeCommand('aiProject.analyzeChange');
          ctx.refresh();
          return;
        }
        throw err;
      }
    },
  };
};
