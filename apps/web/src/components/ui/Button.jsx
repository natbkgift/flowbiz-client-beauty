import React from 'react';

const BUTTON_VARIANTS = {
  primary: 'primary-button',
  secondary: 'secondary-button',
  ghost: 'ghost-button',
  danger: 'danger-button',
  ghostDanger: 'ghost-danger-button'
};

function joinClassNames(...classNames) {
  return classNames.filter(Boolean).join(' ');
}

export function Button({ variant = 'primary', className = '', type = 'button', children, ...props }) {
  return (
    <button
      type={type}
      className={joinClassNames(BUTTON_VARIANTS[variant] || variant, className)}
      {...props}
    >
      {children}
    </button>
  );
}
