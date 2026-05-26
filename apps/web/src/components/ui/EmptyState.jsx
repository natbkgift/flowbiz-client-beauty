import React from 'react';
import { Card } from './Card.jsx';

export function EmptyState({ title, message, testId = 'empty-state', className = '' }) {
  return (
    <Card variant="notice" className={className} data-testid={testId}>
      {title ? <h3 className="section-heading">{title}</h3> : null}
      {message ? <p className="muted">{message}</p> : null}
    </Card>
  );
}
