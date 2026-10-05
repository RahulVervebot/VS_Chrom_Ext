import React from 'react';
import ChromeConnection from '../components/ChromeConnection.jsx';
import { Empty } from '../components/common.jsx';

export default function ConnectionPage({ state, refresh }) {
  if (!state.initialized) return <Empty>Initialize the project first; pairing is per project.</Empty>;
  return <ChromeConnection chrome={state.chrome} reload={refresh} />;
}
