import React from 'react';
import KnowledgeViewer from '../components/KnowledgeViewer.jsx';

export default function KnowledgePage({ state }) { return <KnowledgeViewer analyses={state.analyses} />; }
