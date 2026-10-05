import React from 'react';
import { useRemote } from '../hooks/useAppState.js';
import { Badge, Button, Empty, ErrorBox, Loading } from './common.jsx';
import Markdown from './markdown.jsx';
import { rpc } from '../hooks/useRpc.js';

export default function DocumentationViewer({ docKey }) {
  const { data, error, loading, reload } = useRemote('getDocument', { key: docKey }, [docKey]);
  if (!docKey) return <Empty>Select a document.</Empty>;
  return (
    <div>
      <div className="row wrap">
        <Button onClick={reload}>Refresh</Button>
        <Button onClick={async () => { await rpc('generateDocumentation', { force: true }); reload(); }}>Regenerate</Button>
        {data && data.versions.length > 0 && <span className="muted-text">{data.versions.length} earlier version(s) preserved in snapshots/documentation/</span>}
      </div>
      {loading && <Loading />}
      <ErrorBox error={error} />
      {data && <Markdown source={data.markdown} />}
    </div>
  );
}
