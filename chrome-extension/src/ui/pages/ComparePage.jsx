import React from 'react';
import ComparisonWorkspace from '../components/ComparisonWorkspace.jsx';

export default function ComparePage({ state }) { return <ComparisonWorkspace results={state.results} jobs={state.jobs} />; }
