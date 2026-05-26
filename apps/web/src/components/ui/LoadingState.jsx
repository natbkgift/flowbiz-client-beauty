import React from 'react';
import { Card } from './Card.jsx';

export function LoadingState({ label = 'Loading...', testId = 'loading-state', className = '' }) {
  return (
    <Card variant="notice" className={className} data-testid={testId}>
      <p className="muted">{label}</p>
    </Card>
  );
}
