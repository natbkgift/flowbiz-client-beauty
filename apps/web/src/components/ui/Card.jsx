import React from 'react';

const CARD_VARIANTS = {
  hero: 'hero-card',
  section: 'section-card',
  metric: 'metric-card',
  data: 'data-card',
  login: 'login-card',
  notice: 'notice-card'
};

function joinClassNames(...classNames) {
  return classNames.filter(Boolean).join(' ');
}

export function Card({ as: Component = 'div', variant = 'section', className = '', children, ...props }) {
  return (
    <Component className={joinClassNames(CARD_VARIANTS[variant] || variant, className)} {...props}>
      {children}
    </Component>
  );
}
