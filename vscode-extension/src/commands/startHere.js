// Guided entry point: a checklist that always shows what to do next. Picking a step runs it, then the checklist reappears.
const { fmt } = require('./common');

module.exports = (ctx) => ({
  'aiProject.start': async () => {
    const v = ctx.vscode;
    if (!ctx.pm()) {
      const pick = await v.window.showInformationMessage('AI Project needs a project folder. Open the folder you want to analyze first.', 'Open Folder…');
      if (pick) await v.commands.executeCommand('workbench.action.files.openFolder');
      return;
    }
    const run = (id, ...a) => v.commands.executeCommand(id, ...a);

    for (;;) {
      const pm = ctx.pm();
      const initialized = pm.isInitialized();
      const fileCount = initialized ? (await pm.knowledge.getFiles()).length : 0;
      const scanned = fileCount > 0;
      const hasSel = !ctx.selection.isEmpty();
      const connected = pm.bridge.getStatus().state === 'CONNECTED';
      const steps = [
        { id: 'init', done: initialized, title: '1. Set up this project', detail: initialized ? 'Done: .ai-project folder exists' : 'Creates a .ai-project folder next to your code (safe to run again)' },
        { id: 'scan', done: scanned, title: '2. Scan the code', detail: scanned ? `Done: ${fmt(fileCount)} files indexed. Pick again to refresh after edits` : 'Reads your files and finds workflows, APIs and database usage. No AI involved yet' },
        { id: 'select', done: hasSel, title: '3. Choose what to analyze', detail: hasSel ? `Selected: ${ctx.selection.summary()}` : 'The entire project, one folder, or specific files' },
        { id: 'pair', done: connected, title: '4. Connect Chrome (once)', detail: connected ? 'Done: Chrome is connected' : 'Shows a code to type into the Chrome extension' },
        { id: 'analyze', done: false, title: '5. Analyze with AI', detail: 'Sends your selection to the AI through Chrome, after you review and approve it' },
      ];
      const next = steps.find((s) => !s.done && s.id !== 'analyze') || steps[4];
      const items = [
        ...steps.map((s) => ({ id: s.id, label: `${s.done ? '$(check)' : s === next ? '$(arrow-right)' : '$(circle-large-outline)'}  ${s.title}`, description: s === next ? 'next' : '', detail: s.detail })),
        { kind: v.QuickPickItemKind.Separator, label: '' },
        { id: 'dash', label: '$(dashboard)  Open the dashboard', detail: 'Workflows, database, dependencies, documentation' },
      ];
      const pick = await v.window.showQuickPick(items, { title: 'AI Project: Start Here', placeHolder: 'Pick a step (Esc to close). Each step runs, then this list comes back', matchOnDetail: true });
      if (!pick) return;

      if (pick.id === 'dash') { await run('aiProject.openDashboard'); return; }
      // Steps are run in order: choosing a later step first quietly does the earlier ones it depends on.
      if (!ctx.pm().isInitialized() && pick.id !== 'init') await run('aiProject.initializeProject');
      if (pick.id !== 'init' && !ctx.pm().isInitialized()) continue; // the user cancelled the name prompt
      const needScan = pick.id !== 'init' && pick.id !== 'pair';
      if (needScan && !ctx.pm().analysis && (await ctx.pm().knowledge.getFiles()).length === 0) await run('aiProject.scanProject');

      if (pick.id === 'init') await run('aiProject.initializeProject');
      else if (pick.id === 'scan') await run('aiProject.scanProject');
      else if (pick.id === 'select') {
        const choice = await v.window.showQuickPick([
          { id: 'project', label: '$(root-folder)  The entire project', detail: 'Everything that is not excluded. Large projects are split into batches' },
          { id: 'folder', label: '$(folder)  A folder…', detail: 'Pick one or more folders' },
          { id: 'files', label: '$(file-code)  Specific files…', detail: 'Pick one or more files' },
          ...(hasSel ? [{ id: 'clear', label: '$(clear-all)  Clear my selection' }] : []),
        ], { title: 'What should be analyzed?' });
        if (!choice) continue;
        if (choice.id === 'project') { ctx.selection.clear(); ctx.selection.add('project'); v.window.showInformationMessage('AI Project: the entire project is selected.'); }
        if (choice.id === 'folder') { ctx.selection.remove('project'); await run('aiProject.selectFolder'); }
        if (choice.id === 'files') { ctx.selection.remove('project'); await run('aiProject.selectFiles'); }
        if (choice.id === 'clear') ctx.selection.clear();
      } else if (pick.id === 'pair') {
        if (connected) v.window.showInformationMessage('AI Project: Chrome is already connected.');
        else { await run('aiProject.pairChrome'); return; } // the user now switches to Chrome; reopen Start Here afterwards
      } else if (pick.id === 'analyze') {
        if (ctx.selection.isEmpty()) { v.window.showInformationMessage('Choose what to analyze first (step 3).'); continue; }
        await run('aiProject.analyzeSelection');
        return;
      }
      ctx.refresh();
    }
  },
});
